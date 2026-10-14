import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+5000;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('every round shuffles human and bot grid slots without reordering identities or changing the host', {timeout:15000},async t=>{
  // Fixed randomness makes the server-level assertion deterministic. The unit
  // test separately enumerates all permutations to check the shuffle's fairness.
  const port=33239,proc=spawn(process.execPath,['--import','data:text/javascript,Math.random=()=>0','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let ws;t.after(()=>{ws?.terminate();proc.kill();});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Server failed');})]);
  ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);let state,welcome;
  ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state')state=m;if(m.type==='welcome')welcome=m;if(m.type==='server-ping')ws.send(JSON.stringify({type:'server-pong',id:m.id}));});
  const send=m=>ws.send(JSON.stringify(m));await once(ws,'open');send({type:'create',name:'Host'});await until(()=>state&&welcome);
  for(let i=0;i<7;i++){send({type:'bot',requestId:`grid-${i}`});await until(()=>state.players.length===i+2);}
  const identity=players=>players.map(({id,name,color,score,bot})=>({id,name,color,score,bot})),original=identity(state.players);
  for(let round=0;round<3;round++){
    if(round){send({type:'lobby'});await until(()=>state.phase==='lobby');}
    send({type:'start'});await until(()=>state.phase==='countdown');
    assert.deepEqual(state.players.map(p=>p.gridSlot),[1,2,3,4,5,6,7,0]);
    assert.deepEqual(identity(state.players),original);assert.equal(state.host,welcome.id);
  }
});
