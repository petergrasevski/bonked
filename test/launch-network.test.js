import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('countdown sockets retain held gas and apply normal, perfect and early starts', {timeout:12000},async t=>{
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'33214',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});const clients=[];let pumping;t.after(()=>{clearInterval(pumping);for(const c of clients)c.ws.terminate();proc.kill('SIGTERM');});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('Test server failed');})]);
  async function client(){const ws=new WebSocket('ws://127.0.0.1:33214/ws'),c={ws,state:null,seq:0,throttle:0,at:null,send:m=>ws.send(JSON.stringify(m)),racing:[]};clients.push(c);ws.on('message',d=>{const m=JSON.parse(d);if(m.type==='welcome')c.id=m.id;if(m.type==='state'){c.state=m;if(m.phase==='racing')c.racing.push(m);}});await once(ws,'open');return c;}
  const normal=await client();normal.send({type:'create'});await until(()=>normal.id&&normal.state);
  for(let i=0;i<2;i++){const c=await client();c.send({type:'join',code:normal.state.code});await until(()=>c.id);}
  normal.send({type:'start'});await until(()=>clients.every(c=>c.state.phase==='countdown'));const start=normal.state.startAt,grid=normal.state.players.map(p=>({x:p.x,z:p.z}));
  pumping=setInterval(()=>{for(const c of clients)c.send({type:'input',seq:++c.seq,throttle:c.throttle,steer:0,accelPressedAt:c.at});},16);
  // Spinout is sustained from >2s early; normal starts at 1.5s; perfect at 1s.
  const leads=[1500,1000,2500];await Promise.all(clients.map(async(c,i)=>{await sleep(Math.max(0,start-leads[i]-Date.now()));c.at=start-leads[i];c.throttle=1;c.send({type:'input',seq:++c.seq,throttle:1,accelPressedAt:c.at});}));
  assert.deepEqual(normal.state.players.map(p=>({x:p.x,z:p.z})),grid,'revving must not move the grid');
  await until(()=>clients.every(c=>c.racing.length));const first=normal.racing[0];assert.deepEqual(first.players.map(p=>p.launchResult),['normal','boost','spinout']);assert.ok(first.players[1].boost>0);assert.ok(first.players[2].spinout>0);
  await until(()=>normal.state.time>=start+1600);for(const p of normal.state.players)assert.ok(Math.hypot(p.vx,p.vz)>2,'held gas must move every car after spinout finishes');
});
