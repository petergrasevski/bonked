import test from 'node:test';
import assert from 'node:assert/strict';
import {LanSignaling} from '../server-lan.js';
import {createRoomEngine} from '../shared/room-engine.js';
import {DeploymentGate} from '../server-deployment.js';
import {STEP,NEUTRAL} from '../shared/game.js';

function setup(){let now=1000;const service=new LanSignaling({send:(ws,msg)=>ws?.messages.push(msg),revision:'revision',now:()=>now});const socket=()=>({readyState:1,messages:[],close(){this.readyState=3;}});const host=socket();service.handle(host,{type:'lan-create',revision:'revision'});const welcome=host.messages.at(-1);const join=(extra={})=>{const ws=socket();service.handle(ws,{type:'lan-join',revision:'revision',code:welcome.code,name:'Driver',...extra});return ws;};return {service,host,welcome,socket,join,setNow:n=>now=n};}

test('LAN signaling reserves eight controller slots independently of the display and protects host identity',()=>{
  const {service,host,welcome,join,socket}=setup();
  const phones=Array.from({length:8},()=>join());assert.ok(phones.every(p=>p.messages[0].type==='lan-welcome'));assert.equal(join().messages.at(-1).type,'error');
  const hostNotice=host.messages.find(m=>m.type==='lan-peer');assert.ok(hostNotice.generation);
  const intruder=socket();service.handle(intruder,{type:'lan-create',code:welcome.code,token:'wrong',revision:'revision'});assert.equal(intruder.messages.at(-1).type,'error');assert.equal(service.rooms.size,1);
  const stale=socket();service.handle(stale,{type:'lan-join',code:welcome.code,revision:'old'});assert.match(stale.messages[0].message,/updated/);
});

test('LAN signaling routes bounded host/phone SDP and local ICE, never gameplay or phone-to-phone traffic',()=>{
  const {service,host,join,welcome}=setup(),a=join(),b=join(),aw=a.messages[0],bw=b.messages[0],notice=host.messages.find(m=>m.id===aw.id&&m.type==='lan-peer');
  const generation=notice.generation,signal={description:{type:'offer',sdp:'test-offer'}};
  service.handle(host,{type:'lan-signal',to:aw.id,generation,signal});assert.equal(a.messages.at(-1).type,'lan-signal');assert.deepEqual(a.messages.at(-1).signal,signal);
  const before=b.messages.length;service.handle(a,{type:'lan-signal',to:bw.id,generation,signal:{description:{type:'answer',sdp:'test'}}});assert.equal(b.messages.length,before);
  const hostBefore=host.messages.length;
  service.handle(a,{type:'input',seq:1,throttle:1});service.handle(a,{type:'lan-signal',to:welcome.id,generation,signal:{candidate:{candidate:'candidate:1 1 UDP 1 1.2.3.4 1234 typ relay'}}});assert.equal(host.messages.length,hostBefore);
  service.handle(a,{type:'lan-signal',to:welcome.id,generation,signal:{description:{type:'answer',sdp:'x'.repeat(12001)}}});assert.equal(host.messages.length,hostBefore);
  service.handle(a,{type:'lan-signal',to:welcome.id,generation:'old',signal:{description:{type:'answer',sdp:'test'}}});assert.equal(host.messages.length,hostBefore);
  service.handle(a,{type:'lan-signal',to:welcome.id,generation,signal:{candidate:{candidate:'candidate:1 1 UDP 1 local.local 1234 typ host',sdpMid:'0',sdpMLineIndex:0}}});assert.equal(host.messages.at(-1).type,'lan-signal');
});

test('LAN reconnection preserves identity, changes negotiation generation, and ends abandoned hosts',()=>{
  const {service,host,welcome,join,socket,setNow}=setup(),a=join(),aw=a.messages[0];service.disconnect(a);
  const previous=host.messages.at(-1).generation,b=join({token:aw.token});assert.equal(b.messages[0].id,aw.id);assert.notEqual(host.messages.at(-1).generation,previous);
  const gate=new DeploymentGate({rooms:service.rooms,graceMs:20000,now:()=>1000});assert.equal(gate.acquire('deployment').status,409);
  service.disconnect(host);setNow(5000);const resumed=socket();service.handle(resumed,{type:'lan-create',revision:'revision',code:welcome.code,token:welcome.token});assert.equal(resumed.messages[0].code,welcome.code);
  service.disconnect(resumed);setNow(30001);service.sweep();assert.equal(service.rooms.size,0);assert.equal(b.messages.at(-1).type,'lan-ended');
  const stale=socket();service.handle(stale,{type:'lan-create',revision:'revision',code:welcome.code,token:welcome.token});assert.equal(stale.messages.at(-1).type,'error');assert.equal(service.rooms.size,0);
});

test('one room engine enforces controller authority, stale input, bots and round rules for a display host',()=>{
  let now=1000;const errors=[],engine=createRoomEngine({now:()=>now,send:(_,m)=>errors.push(m)});
  const room={code:'LAN',host:'display',trackId:'coast',players:new Map()};engine.resetRoom(room,{newTournament:true});
  const connection={readyState:1},p=engine.addPlayer(room,connection,'Driver'),display={id:'display'};
  engine.command(room,p,{type:'start'},now);assert.equal(room.phase,'lobby');assert.match(errors[0].message,/host/);
  engine.command(room,display,{type:'bot'},now);assert.equal(room.players.size,2);
  engine.command(room,display,{type:'start'},now);assert.equal(room.phase,'countdown');assert.equal(room.raceSize,2);assert.equal(room.host,'display');
  engine.command(room,p,{type:'input',seq:1,...NEUTRAL,throttle:1,health:999,item:'rocket'},now);assert.equal(p.car.health,100);assert.notEqual(p.car.item,'rocket');
  now=room.startAt+50;engine.step(room,now);assert.equal(room.phase,'racing');assert.equal(room.simulationTick,1);assert.equal(room.raceTime,STEP);assert.equal(p.simInput.throttle,0,'stale controls release');
  engine.command(room,p,{type:'input',seq:2,...NEUTRAL,throttle:1},now);engine.step(room,now+17);assert.equal(p.simInput.throttle,1);
  engine.command(room,p,{type:'input',seq:1,...NEUTRAL,throttle:0},now+18);assert.equal(p.input.throttle,1,'out of order inputs are ignored');
  const snap=engine.snapshot(room);assert.equal(snap.players.length,2);assert.equal(snap.host,'display');assert.equal(snap.time,now);
});
