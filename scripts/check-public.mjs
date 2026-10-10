import assert from 'node:assert/strict';
import { TRACK_LENGTH } from '../shared/game.js';
import { CHASE_DISTANCE } from '../shared/chase.js';
import { WebSocket } from 'ws';
const address=process.argv[2];
if(!address)throw Error('Usage: node scripts/check-public.mjs https://your-game-host');
const url=new URL(address),clients=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(fn())return;await pause(25);}throw Error('Public connection timed out');}
async function connect(){
  const ws=new WebSocket(`${url.protocol==='https:'?'wss:':'ws:'}//${url.host}/ws`,{origin:url.origin});
  const c={ws,state:null,id:null,seq:0,pings:[],send:m=>ws.send(JSON.stringify(m))};clients.push(c);
  ws.on('error',error=>c.error=error);
  ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='welcome')c.id=m.id;if(m.type==='state')c.state=m;if(m.type==='error')c.error=Error(m.message);if(m.type==='pong')c.pings.push(Date.now()-m.sent);});
  await until(()=>ws.readyState===WebSocket.OPEN||c.error);if(c.error)throw c.error;return c;
}
try{
  const health=await fetch(new URL('/health',url));assert.equal(health.status,200);
  const host=await connect();host.send({type:'create',name:'Connection check 1'});await until(()=>host.id&&host.state);
  for(let i=1;i<6;i++){const c=await connect();c.send({type:'join',code:host.state.code,name:`Connection check ${i+1}`});await until(()=>c.id||c.error);if(c.error)throw c.error;}
  await until(()=>clients.every(c=>c.state?.players.length===6));
  assert.equal(new Set(host.state.players.map(p=>p.color)).size,6);assert.ok(host.state.players.every(p=>p.health===100));assert.ok(Array.isArray(host.state.mines)&&Array.isArray(host.state.chains));assert.ok(host.state.pickups.every(p=>typeof p.item==='string'));assert.equal((await fetch(new URL('/pickups.js',url))).status,200);assert.equal((await fetch(new URL('/vendor/RoundedBoxGeometry.js',url))).status,200);assert.equal((await fetch(new URL('/shared/combat.js',url))).status,200);assert.equal((await fetch(new URL('/shared/camera.js',url))).status,200);
  for(let i=0;i<5;i++){for(const c of clients)c.send({type:'ping',sent:Date.now()});await pause(150);}
  host.send({type:'start'});await until(()=>clients.every(c=>c.state.phase==='racing'));
  assert.ok(host.state.camera.pitch>=26*Math.PI/180&&host.state.camera.pitch<=70*Math.PI/180);assert.ok(Number.isFinite(host.state.camera.from)&&host.state.camera.to>host.state.camera.from);assert.ok(host.state.chase.active);assert.ok(Math.abs((host.state.chase.leaderProgress-host.state.chase.progress)*TRACK_LENGTH-CHASE_DISTANCE)<.001);
  const before=host.state.players.find(p=>p.id===host.id);
  for(let i=0;i<30;i++){host.send({type:'input',seq:++host.seq,throttle:1,steer:0});await pause(33);}
  await until(()=>Math.hypot(host.state.players.find(p=>p.id===host.id).vx,host.state.players.find(p=>p.id===host.id).vz)>5);
  const after=host.state.players.find(p=>p.id===host.id);assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1);
  assert.ok(clients.every(c=>!c.error));
  const pings=clients.flatMap(c=>c.pings).sort((a,b)=>a-b);
  console.log(JSON.stringify({result:'passed',publicHTTPS:true,webSocketClients:6,raceStarted:true,movementReplicated:true,pingSamples:pings.length,medianRoundTripMs:pings[Math.floor(pings.length/2)]},null,2));
}finally{for(const c of clients){if(c.ws.readyState===WebSocket.OPEN)c.send({type:'leave'});c.ws.close();}await pause(300);for(const c of clients)c.ws.terminate();}
