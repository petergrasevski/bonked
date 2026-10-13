import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {botInput} from '../shared/game.js';
const port=33211,base=`http://127.0.0.1:${port}`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=3000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await sleep(20);}throw new Error('Condition timed out');}
async function client(){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),c={ws,messages:[],state:null,seq:0,send:m=>ws.send(JSON.stringify(m))};ws.on('message',data=>{const msg=JSON.parse(data);c.messages.push(msg);if(c.messages.length>100)c.messages.shift();if(msg.type==='welcome')c.welcome=msg;if(msg.type==='state')c.state=msg;});await once(ws,'open');return c;}
test('eight real socket clients: lobby, authority, reconnect, elimination, shared camera, tournament readiness and advancing grid', {timeout:70000}, async t=>{
  const proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  const clients=[];let driving; t.after(()=>{clearInterval(driving);for(const c of clients)c.ws.terminate();proc.kill('SIGTERM');});
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error('test server failed to start');})]);
  assert.equal((await fetch(`${base}/health`).then(r=>r.json())).status,'ok');
  assert.equal((await fetch(`${base}/`)).status,200);assert.equal((await fetch(`${base}/vendor/three.module.js`)).status,200);assert.equal((await fetch(`${base}/server.js`)).status,404);assert.equal((await fetch(`${base}/shared/camera.js`)).status,200);assert.equal((await fetch(`${base}/shared/desert-storm.js`)).status,200);
  const html=await fetch(`${base}/`).then(r=>r.text());
  const artwork=[...html.matchAll(/href="(\/track-titles\/[^"]+\.webp)"/g)].map(m=>m[1]);assert.equal(artwork.length,3);
  let imageBytes=0;for(const path of artwork){const response=await fetch(base+path);assert.equal(response.headers.get('content-type'),'image/webp');assert.match(response.headers.get('cache-control'),/max-age=31536000, immutable/);const data=Buffer.from(await response.arrayBuffer());assert.equal(data.toString('ascii',8,12),'WEBP');assert.equal(Number(response.headers.get('content-length')),data.length);imageBytes+=data.length;}assert.ok(imageBytes<400000,'all three titles fit under 400 KB');
  assert.equal((await fetch(`${base}/shared/combat-prediction.js`)).status,200);
  const host=await client();clients.push(host);host.send({type:'create',name:'Host'});await until(()=>host.welcome);const code=host.welcome.code;assert.match(code,/^[A-Z]{3}$/);
  for(let i=1;i<9;i++){const c=await client();clients.push(c);c.send({type:'join',code,name:`Driver ${i}`});await until(()=>c.welcome||c.messages.some(m=>m.type==='error'));}
  assert.match(clients[8].messages.find(m=>m.type==='error').message,/eight drivers/);
  await until(()=>host.state?.players.length===8);assert.equal(new Set(host.state.players.map(p=>p.color)).size,8);
  clients[1].send({type:'start'});await until(()=>clients[1].messages.some(m=>m.type==='error'));assert.equal(host.state.phase,'lobby');
  const initialX=host.state.players.find(p=>p.id===host.welcome.id).x;host.send({type:'input',seq:1,throttle:0,steer:0,x:100000,z:100000,health:9999,item:'railgun',ammo:999});await sleep(100);assert.equal(host.state.players.find(p=>p.id===host.welcome.id).x,initialX);assert.equal(host.state.players[0].health,100);assert.equal(host.state.players[0].item,null);
  const reconnecting=clients[2],identity=reconnecting.welcome;reconnecting.ws.close();await until(()=>host.state.players.find(p=>p.id===identity.id)?.connected===false);
  const reconnected=await client();clients.push(reconnected);reconnected.send({type:'join',code,token:identity.token});await until(()=>reconnected.welcome);assert.equal(reconnected.welcome.id,identity.id);
  const racers=[host,clients[1],reconnected,clients[3],clients[4],clients[5],clients[6],clients[7]];
  host.send({type:'start'});await until(()=>host.state.phase==='countdown');
  // The server, not any client, owns the starting signal and positions.
  const gridX=host.state.players[0].x;host.send({type:'input',seq:2,throttle:1,steer:0});await sleep(300);assert.equal(host.state.players[0].x,gridX);
  await until(()=>host.state.phase==='racing',5000);
  for(const p of host.state.players)for(const key of ['renderVx','renderVz','renderRise','renderTurn','renderPitch','renderRoll','renderProgress'])assert.ok(Number.isFinite(p[key]),`snapshot carries measured ${key}`);
  const eliminations=new Set();
  let snapshots=0,lastTime=0,pickups=0;const driveUntil=Date.now()+6000;
  driving=setInterval(()=>{for(const c of racers){const p=c.state?.players.find(p=>p.id===c.welcome.id);if(!p)continue;if(c!==host&&Date.now()>driveUntil)continue;c.seq=Math.max(c.seq,p.seq)+1;c.send({type:'input',seq:c.seq,...botInput(p)});if(p.item){pickups++;if(c===host)c.send({type:'item'});}}for(const event of host.state.sounds||[])if(event.kind==='elimination')eliminations.add(event.owner);if(host.state.time!==lastTime){snapshots++;lastTime=host.state.time;}},1000/60);
  await until(()=>host.state.phase==='finished',55000);clearInterval(driving);
  assert.ok(eliminations.size>0,'death-line eliminations must reach clients as sound events');
  assert.ok(snapshots>100,'server should continuously send snapshots');assert.ok(pickups>0,'drivers collect and use items');assert.equal(host.state.players.filter(p=>p.eliminated).length,7);assert.equal(host.state.winnerId,host.welcome.id);assert.ok(host.state.players.find(p=>p.id===host.welcome.id).finished);assert.ok(host.state.camera.pitch>=26*Math.PI/180&&host.state.camera.pitch<=70*Math.PI/180);assert.ok(Number.isFinite(host.state.camera.from)&&host.state.camera.to>host.state.camera.from);assert.ok(host.state.chase.active);
  assert.ok(host.state.players.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
  assert.ok(host.state.players.find(p=>p.id===host.welcome.id).finishTime>3000);
  assert.equal(host.state.players.find(p=>p.id===host.welcome.id).score,3);assert.equal(host.state.roundResults.length,8);const checkpoint=host.state.players.find(p=>p.id===host.welcome.id).trackFraction;
  for(const c of racers)c.send({type:'ready',round:host.state.round});await until(()=>host.state.phase==='countdown');assert.equal(host.state.round,2);assert.equal(host.state.roundStartFraction,checkpoint);assert.ok(host.state.players.every(p=>!p.finished&&!p.eliminated&&p.item===null));assert.equal(host.state.players.find(p=>p.id===host.welcome.id).score,3);
  // Host leaves explicitly: room ownership passes to a connected driver.
  host.send({type:'leave'});await until(()=>clients[1].state.players.length===7);assert.equal(clients[1].state.host,clients[1].welcome.id);
});
