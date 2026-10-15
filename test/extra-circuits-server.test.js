import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){const end=Date.now()+6500;while(Date.now()<end){if(fn())return;await sleep(20);}throw new Error('Timed out waiting for race state');}
test('both additional circuits support eight-car multiplayer races and switching', {timeout:25000},async t=>{
  const port=33259,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>proc.kill());await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw new Error('Server exited');})]);
  const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);t.after(()=>ws.terminate());let state;const errors=[];
  ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state')state=m;if(m.type==='error')errors.push(m.message);});await once(ws,'open');
  const send=m=>ws.send(JSON.stringify(m));send({type:'create'});await until(()=>state);for(let i=0;i<7;i++)send({type:'bot'});await until(()=>state.players.length===8);
  for(const id of ['factory','volcano']){
    send({type:'track',trackId:id});await until(()=>state.trackId===id);assert.equal(state.players.length,8);assert.ok(state.pickups.length>20);assert.ok(state.boostPads.length>=6);
    send({type:'start'});await until(()=>state.phase==='racing');await until(()=>state.raceTime>.2);
    assert.equal(state.trackId,id);assert.equal(state.players.length,8);for(const car of state.players){assert.ok(Number.isFinite(car.x)&&Number.isFinite(car.y)&&Number.isFinite(car.z));assert.equal(car.falling,false);}
    send({type:'lobby'});await until(()=>state.phase==='lobby');
  }
  assert.deepEqual(errors,[]);
});
