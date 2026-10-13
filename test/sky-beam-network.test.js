import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {nearestTrack,selectTrack} from '../shared/game.js';
import {SKY_TRACK_MARGIN} from '../shared/sky-beam.js';
const port=33305;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=18000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(20);}throw Error('Sky beam network condition timed out');}
test('real spectator input publishes locked beams and server-owned cooldown', {timeout:30000},async t=>{
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});let ws,timer;t.after(()=>{clearInterval(timer);ws?.terminate();proc.kill('SIGTERM');});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Server failed to start');})]);
  for(const path of ['sky-beam','sky-ground','shockwave'])assert.equal((await fetch(`http://127.0.0.1:${port}/shared/${path}.js`)).status,200);
  ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);let state,id,seq=0,command={fire:false},seen=[];
  ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='welcome')id=m.id;if(m.type==='state'){state=m;seen.push(m);}});await once(ws,'open');const send=m=>ws.send(JSON.stringify(m)),me=()=>state?.players.find(p=>p.id===id);
  send({type:'create',name:'Spectator test'});await until(()=>id&&state?.phase==='lobby');for(let i=0;i<3;i++)send({type:'bot'});await until(()=>state.players.length===4);send({type:'start'});
  timer=setInterval(()=>send({type:'input',seq:++seq,...command}),30);await until(()=>me()?.eliminated&&state.phase==='racing'&&me().skyTarget);
  const live=state.players.find(p=>!p.eliminated),aim={x:live.x,z:live.z};command={fire:true,skyAim:aim,skyCooldownUntil:0};await until(()=>state.skyBeams.length>0,2000);
  const strike={...state.skyBeams[0]};assert.equal(strike.owner,id);assert.equal(strike.impactAt-strike.at,600);assert.equal(strike.color,me().color);assert.equal(me().skyCooldownUntil,strike.at+3000);assert.ok(Math.hypot(strike.x-aim.x,strike.z-aim.z)<.001);
  command={fire:false,skyAim:{x:aim.x+10,z:aim.z+10}};await until(()=>seen.some(s=>s.effects.some(e=>e.kind==='pulse'&&e.color===strike.color&&e.x===strike.x&&e.z===strike.z)),2000);
  const impact=seen.find(s=>s.effects.some(e=>e.kind==='pulse'&&e.color===strike.color&&e.x===strike.x&&e.z===strike.z));assert.ok(impact.time>=strike.impactAt);assert.ok(impact.time-strike.impactAt<200);
  command={fire:true,skyAim:aim,skyCooldownUntil:0};await sleep(150);assert.equal(me().skyCooldownUntil,strike.at+3000,'client cannot reset cooldown');
  const constrainedSeq=seq+1;command={fire:false,skyAim:{x:1e8,z:-1e8}};
  await until(()=>me().seq>=constrainedSeq);selectTrack(state.trackId);
  const road=nearestTrack(me().skyTarget.x,me().skyTarget.z);
  assert.ok(road.distance<=road.halfWidth+.6+SKY_TRACK_MARGIN+1e-6,'forged off-track input is constrained in real server snapshots');

});
