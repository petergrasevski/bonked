import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('host circuit controls preserve earned scores; explicit reset and completed tournaments clear them',{timeout:60000},async t=>{
  const port=33230,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']}),clients=[];
  t.after(()=>{for(const c of clients)c.ws.terminate();proc.kill();});await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Server failed');})]);
  async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),c={ws,errors:[],send:m=>ws.send(JSON.stringify(m))};clients.push(c);ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;if(m.type==='error')c.errors.push(m);});await once(ws,'open');return c;}
  const host=await client();host.send({type:'create'});await until(()=>host.state);
  async function finishRound(){const other=await client();other.send({type:'join',code:host.welcome.code});await until(()=>other.state&&host.state.players.length===2);host.send({type:'start'});await until(()=>host.state.phase==='countdown');other.send({type:'leave'});await until(()=>host.state.phase==='finished',10000);}
  await finishRound();assert.equal(host.state.players[0].score,3);
  host.send({type:'lobby'});await until(()=>host.state.phase==='lobby');assert.equal(host.state.players[0].score,3);const round=host.state.round;
  for(const trackId of ['ice','desert','coast']){host.send({type:'track',trackId});await until(()=>host.state.trackId===trackId);assert.equal(host.state.players[0].score,3);assert.equal(host.state.round,round);}
  host.send({type:'start'});await until(()=>host.state.phase==='countdown');assert.equal(host.state.players[0].score,3);host.send({type:'lobby'});await until(()=>host.state.phase==='lobby');assert.equal(host.state.players[0].score,3);
  const guest=await client();guest.send({type:'join',code:host.welcome.code});await until(()=>guest.state);
  for(const type of ['reset-scores','lobby','track'])guest.send({type,trackId:'ice'});await until(()=>guest.errors.length===3);assert.equal(host.state.trackId,'coast');assert.equal(host.state.players[0].score,3);
  host.send({type:'bot',requestId:'bot-once'});host.send({type:'bot',requestId:'bot-once'});await until(()=>host.state.players.some(p=>p.botRequestId==='bot-once'));assert.equal(host.state.players.filter(p=>p.bot).length,1);
  host.send({type:'remove-bot',playerId:host.state.players.find(p=>p.bot).id});guest.send({type:'leave'});await until(()=>host.state.players.length===1);
  host.send({type:'reset-scores'});await until(()=>host.state.players[0].score===0);assert.equal(host.state.round,1);
  // Complete five real rounds after an opponent leaves, then start fresh.
  for(let round=1;round<=5;round++){
    await finishRound();assert.equal(host.state.round,round);assert.equal(host.state.players[0].score,round*3);
    if(round<5){host.send({type:'lobby'});await until(()=>host.state.phase==='lobby');}
  }
  assert.equal(host.state.tournamentComplete,true);host.send({type:'rematch'});await until(()=>host.state.phase==='countdown');assert.equal(host.state.players[0].score,0);assert.equal(host.state.round,1);assert.deepEqual(host.errors,[]);
});
