import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('unloaded clients never block starting, switching circuits or resuming a race',{timeout:15000},async t=>{
  const port=33229,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']}),clients=[];
  t.after(()=>{for(const c of clients)c.ws.terminate();proc.kill();});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Server failed');})]);
  async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),c={ws,errors:[],send:m=>ws.send(JSON.stringify(m))};clients.push(c);ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;if(m.type==='error')c.errors.push(m);});await once(ws,'open');return c;}
  const host=await client();host.send({type:'create'});await until(()=>host.state);
  const guest=await client();guest.send({type:'join',code:host.welcome.code});await until(()=>guest.state&&host.state.players.length===2);
  host.send({type:'track',trackId:'ice'});host.send({type:'start'});await until(()=>host.state.phase==='countdown'&&guest.state.phase==='countdown');assert.equal(host.state.trackId,'ice');
  // Neither client sends any circuit-ready acknowledgement, including reconnect.
  guest.ws.close();await until(()=>!host.state.players.find(p=>p.id===guest.welcome.id).connected);
  const reconnect=await client();reconnect.send({type:'join',code:host.welcome.code,token:guest.welcome.token});await until(()=>reconnect.state?.phase==='countdown');
  host.send({type:'lobby'});await until(()=>host.state.phase==='lobby');host.send({type:'track',trackId:'desert'});host.send({type:'start'});await until(()=>host.state.phase==='countdown'&&host.state.trackId==='desert');
  await until(()=>reconnect.state?.phase==='racing');assert.equal(reconnect.state.trackId,'desert');assert.ok(reconnect.state.players.find(p=>p.id===guest.welcome.id));assert.deepEqual(host.errors,[]);
});
