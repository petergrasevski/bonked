import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {lanURLs,seatExpired,RECONNECT_GRACE_MS} from '../lan.js';
import {roomOccupancy} from '../server-deployment.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(10);}throw Error('Timed out');}
test('LAN addresses exclude loopback, tunnels and public addresses; reconnect grace stays 20 seconds',()=>{
  const entry=address=>({family:'IPv4',address,internal:false});
  assert.deepEqual(lanURLs(3210,{en0:[entry('192.168.1.5')],en1:[entry('10.0.0.2')],utun0:[entry('10.1.2.3')],public:[entry('8.8.8.8')],lo0:[{...entry('127.0.0.1'),internal:true}]}),['http://192.168.1.5:3210','http://10.0.0.2:3210']);
  assert.equal(RECONNECT_GRACE_MS,20000);assert.equal(seatExpired({disconnectedAt:1000},21000),false);assert.equal(seatExpired({disconnectedAt:1000},21001),true);assert.equal(seatExpired({ws:{},disconnectedAt:0},1e6),false);
});
test('LAN shared display hosts eight drivers, QR, countdown inputs, reconnect and cleanup',{timeout:15000},async t=>{
  const port=33341,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LAN_MODE:'1'},stdio:['ignore','pipe','pipe']}),clients=[];
  t.after(()=>{for(const c of clients)c.ws.terminate();proc.kill('SIGTERM');});let logs='';proc.stderr.on('data',d=>logs+=d);
  await Promise.race([once(proc.stdout,'data'),once(proc,'exit').then(()=>{throw Error(logs||'Server failed');})]);
  const base=`http://127.0.0.1:${port}`;assert.equal((await fetch(base+'/api/config').then(r=>r.json())).lanMode,true);
  async function connect(){const ws=new WebSocket(base.replace('http','ws')+'/ws'),c={ws,messages:[],send:m=>ws.send(JSON.stringify(m))};clients.push(c);ws.on('message',d=>{const m=JSON.parse(d);c.messages.push(m);if(m.type==='welcome')c.welcome=m;if(m.type==='state')c.state=m;});await once(ws,'open');return c;}
  const host=await connect();host.send({type:'create',display:true});await until(()=>host.state);assert.equal(host.state.players.length,0);assert.equal(host.state.host,host.welcome.id);assert.equal(host.welcome.display,true);
  const rooms=await fetch(base+'/api/lan/rooms').then(r=>r.json());assert.equal(rooms[0].code,host.state.code);
  const qr=await fetch(base+'/api/qr?url='+encodeURIComponent(base+'/lan.html?room='+host.state.code));assert.match(await qr.text(),/<svg/);
  host.send({type:'start'});await until(()=>host.messages.some(m=>m.type==='error'));assert.equal(host.state.phase,'lobby');
  const phones=[];for(let i=0;i<8;i++){const p=await connect();p.send({type:'join',code:host.state.code,name:'Phone '+i});await until(()=>p.welcome);phones.push(p);}await until(()=>host.state.players.length===8);
  const excess=await connect();excess.send({type:'join',code:host.state.code});await until(()=>excess.messages.some(m=>m.type==='error'));assert.match(excess.messages.at(-1).message,/eight/);
  phones[0].send({type:'start'});await until(()=>phones[0].messages.some(m=>m.type==='error'));assert.equal(host.state.phase,'lobby');
  host.send({type:'start'});await until(()=>phones.every(p=>p.state.phase==='countdown'));
  phones[0].send({type:'input',seq:1,throttle:1,accelPressedAt:Date.now()});await until(()=>host.state.players[0].input.throttle===1);assert.equal(host.state.players[0].vx,0);
  assert.deepEqual(await fetch(base+'/api/lan/rooms').then(r=>r.json()),[]);
  const invalidHost=await connect();invalidHost.send({type:'join',code:host.state.code,display:true,token:'wrong'});await until(()=>invalidHost.messages.some(m=>m.type==='error'));assert.equal(invalidHost.welcome,undefined);
  const token=host.welcome.token,code=host.state.code;host.ws.close();await once(host.ws,'close');const resumed=await connect();resumed.send({type:'join',code,token,display:true});await until(()=>resumed.welcome);assert.equal(resumed.welcome.id,host.welcome.id);assert.equal(resumed.welcome.display,true);
  const old=phones[0];old.ws.close();await once(old.ws,'close');const phone=await connect();phone.send({type:'join',code,token:old.welcome.token});await until(()=>phone.welcome);assert.equal(phone.welcome.id,old.welcome.id);
  resumed.send({type:'leave'});await until(()=>phone.messages.some(m=>m.type==='left'));assert.equal((await fetch(base+'/health').then(r=>r.json())).rooms,0);assert.equal(logs,'');
});
test('deployment occupancy includes the LAN host display',()=>{
  assert.deepEqual(roomOccupancy(new Map([['ABC',{display:{ws:{readyState:1}},players:new Map()}]]),0,20000),{occupiedRooms:1,players:1});
});
test('public servers expose setup instructions but cannot create LAN displays or list LAN rooms',{timeout:6000},async t=>{
  const port=33342,proc=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LAN_MODE:'0'},stdio:['ignore','pipe','pipe']});let ws;
  t.after(()=>{ws?.terminate();proc.kill('SIGTERM');});await once(proc.stdout,'data');const base=`http://127.0.0.1:${port}`;
  assert.equal((await fetch(base+'/api/config').then(r=>r.json())).lanMode,false);assert.equal((await fetch(base+'/api/lan/rooms')).status,404);assert.equal((await fetch(base+'/lan.html')).status,200);
  ws=new WebSocket(base.replace('http','ws')+'/ws');await once(ws,'open');const received=once(ws,'message');ws.send(JSON.stringify({type:'create',display:true}));assert.equal(JSON.parse((await received)[0]).type,'error');assert.equal((await fetch(base+'/health').then(r=>r.json())).rooms,0);
});
test('LAN display uses a shorter adaptive interpolation buffer without changing online defaults',async()=>{
  const {RemoteSnapshots}=await import('../shared/remote-snapshots.js');const online=new RemoteSnapshots(),lan=new RemoteSnapshots({minDelay:35,maxDelay:100});
  for(let i=0;i<4;i++){const frame={time:i*50,players:[]};online.push(frame,1000+i*50);lan.push(frame,1000+i*50);}
  assert.equal(online.delay,100);assert.equal(lan.delay,35);
  for(let i=4;i<30;i++)lan.push({time:i*50,players:[]},1000+i*50+(i%2?150:0));assert.ok(lan.delay<=100);lan.reset();assert.equal(lan.delay,35);
});
