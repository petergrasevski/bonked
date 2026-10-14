import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('independent track rooms, host authority, authenticated lobby-only audio, leave cleanup', {timeout:15000},async t=>{
  const port=33218,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']}),clients=[];
  t.after(()=>{for(const c of clients)c.ws.terminate();proc.kill();});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Server failed');})]);
  async function connect(endpoint='/ws'){
    const ws=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`),c={ws,messages:[],audio:[],send:m=>ws.send(JSON.stringify(m))};clients.push(c);
    ws.on('message',(data,binary)=>{if(binary)c.audio.push(data);else{const m=JSON.parse(data);c.messages.push(m);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;}});await once(ws,'open');return c;
  }
  const a=await connect();a.send({type:'create',trackId:'ice'});await until(()=>a.welcome&&a.state);
  const b=await connect();b.send({type:'join',code:a.welcome.code});await until(()=>b.welcome);
  const c=await connect();c.send({type:'create',trackId:'desert'});await until(()=>c.welcome&&c.state);
  assert.equal(c.state.trackId,'desert');assert.ok(c.state.players[0].y>19);assert.equal(a.state.trackId,'ice');assert.equal(a.state.players[0].y,1);
  b.send({type:'track',trackId:'desert'});await until(()=>b.messages.some(m=>m.type==='error'));assert.equal(a.state.trackId,'ice');
  a.send({type:'track',trackId:'coast'});await until(()=>b.state.trackId==='coast');assert.equal(c.state.trackId,'desert');
  a.send({type:'track',trackId:'__proto__'});await until(()=>a.messages.some(m=>m.message==='Unknown track.'));assert.equal(a.state.trackId,'coast');
  async function voice(game){const v=await connect('/voice');v.send({type:'join',code:game.welcome.code,token:game.welcome.token});await until(()=>v.messages.some(m=>m.type==='ready'));return v;}
  const av=await voice(a),bv=await voice(b),cv=await voice(c),pcm=Buffer.alloc(640,64);
  av.ws.send(pcm);await until(()=>bv.audio.length===1);assert.equal(bv.audio[0].length,641);assert.deepEqual(bv.audio[0].subarray(1),pcm);
  await sleep(80);assert.equal(cv.audio.length,0);assert.equal(av.audio.length,0,'do not echo microphone');
  // A valid catch-up flood must degrade outgoing audio, never duplex voice.
  const before=bv.audio.length;
  for(let i=0;i<200;i++)av.ws.send(pcm);
  await sleep(100);assert.equal(av.ws.readyState,WebSocket.OPEN);assert.equal(bv.ws.readyState,WebSocket.OPEN);
  assert.ok(bv.audio.length>before&&bv.audio.length<before+200,'bound forwarded catch-up audio');
  const incoming=Buffer.alloc(640,65);bv.ws.send(incoming);await until(()=>av.audio.length===1);assert.deepEqual(av.audio[0].subarray(1),incoming,'listening still works while outgoing audio is limited');
  await sleep(100);const recovered=Buffer.alloc(640,66);av.ws.send(recovered);await until(()=>bv.audio.some(frame=>frame[1]===66));assert.equal(av.ws.readyState,WebSocket.OPEN,'fresh audio recovers on the same connection');
  const bad=await connect('/voice');bad.send({type:'join',code:a.welcome.code,token:'wrong'});await until(()=>bad.ws.readyState===WebSocket.CLOSED);
  // A game input cannot inject voice data, and unauthenticated binary is rejected.
  const unauth=await connect('/voice');unauth.ws.send(pcm);await until(()=>unauth.ws.readyState===WebSocket.CLOSED);
  const receivedBeforeLeave=bv.audio.length;
  b.send({type:'leave'});await until(()=>bv.ws.readyState===WebSocket.CLOSED);av.ws.send(pcm);await sleep(60);assert.equal(bv.audio.length,receivedBeforeLeave);
  c.send({type:'start'});await until(()=>c.state.phase==='countdown');c.send({type:'track',trackId:'ice'});await sleep(60);assert.equal(c.state.trackId,'desert');
  const oversized=await voice(a);oversized.ws.send(Buffer.alloc(642));await until(()=>oversized.ws.readyState===WebSocket.CLOSED);
});
