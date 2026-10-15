import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalControllers} from '../public/local-controllers.js';
import {STANDARD_MAPPING,controllerMapping,decodeController,controllerName} from '../public/controller.js';
import {createPartyHost} from '../shared/party-host.js';

const pad=(index,id='DualSense',mapping='standard')=>({index,id,mapping,connected:true,axes:[0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
const press=(p,index=0,value=true)=>p.buttons[index]={pressed:value,value:value?1:0};
function harness(){
  const events=[],notices=[],configured=[];let now=1000,serial=0,manager,state;
  const host=createPartyHost({now:()=>now,post:message=>{events.push(message);if(message.type==='snapshot')state=message.state;if(message.type==='deliver')manager?.receive(message.id,message.message);}});
  manager=new LocalControllers({uuid:()=>String(++serial),join:slot=>host.handle({type:'peer-open',id:slot.id,name:slot.name}),send:(id,message)=>host.handle({type:'command',id,message}),disconnect:id=>host.handle({type:'peer-close',id}),remove:id=>host.handle({type:'peer-left',id}),notify:msg=>notices.push(msg),configure:d=>configured.push(d)});
  host.handle({type:'create'});
  const poll=(pads,options={})=>{now+=17;manager.poll(pads,{state,now,wallTime:now,...options});host.advance(1/60);};
  const command=message=>host.handle({type:'command',id:'lan-display',message});
  return {manager,host,events,notices,configured,poll,command,get state(){return state;},get now(){return now;},advance:ms=>now+=ms};
}

test('standard gamepad decoding remains independent for multiple devices and custom maps support unknown layouts',()=>{
  const a=pad(0),b=pad(1,'Pro Controller');press(a);b.axes[0]=-.57;
  assert.equal(decodeController(a).throttle,1);assert.equal(decodeController(b).throttle,0);assert.ok(Math.abs(decodeController(b).steer+.5)<1e-10);
  b.mapping='';assert.equal(decodeController(b).connected,false);
  const custom=controllerMapping({...STANDARD_MAPPING,steerAxis:null,buttons:{...STANDARD_MAPPING.buttons,steerLeft:3,steerRight:4,throttle:1}},b);press(b,3);press(b,1);
  assert.equal(decodeController(b,custom).steer,-1);assert.equal(decodeController(b,custom).throttle,1);
  assert.equal(decodeController(b,{...custom,invertSteer:true}).steer,-1,'axis inversion does not reverse named steering buttons');
  assert.equal(controllerMapping({...STANDARD_MAPPING,buttons:{...STANDARD_MAPPING.buttons,fire:99}},b),null);
  assert.equal(controllerName('Wireless Controller (Vendor: 054c Product: 0ce6)'),'DualSense');assert.equal(controllerName('Pro Controller'),'Switch Pro');
});

test('eight physical devices press to join distinct players and share the authoritative grid with phones and bots',()=>{
  const h=harness(),pads=Array.from({length:8},(_,i)=>pad(i));h.poll(pads);assert.equal(h.state.players.length,0);
  pads.forEach(p=>press(p));h.poll(pads);assert.equal(h.state.players.length,8);assert.deepEqual(h.state.players.map(p=>p.name),Array.from({length:8},(_,i)=>'DualSense '+(i+1)));
  const ninth=pad(8);press(ninth);h.poll([...pads,ninth]);assert.equal(h.state.players.length,8);assert.match(h.notices.at(-1),/full/);
  h.host.handle({type:'peer-open',id:'phone',name:'Phone'});assert.match(h.events.at(-1).message.message,/full/);
  h.command({type:'bot'});assert.match(h.events.at(-1).message.message,/full/);
});

test('local and phone players drive through the same engine without local gameplay requiring room registration',()=>{
  const h=harness(),a=pad(0),b=pad(1);h.poll([a,b]);press(a);press(b);h.poll([a,b]);press(a,0,false);press(b,0,false);h.poll([a,b]);
  h.host.handle({type:'peer-open',id:'phone',name:'Phone'});h.command({type:'bot'});assert.equal(h.state.code,'LOCAL');assert.equal(h.state.players.length,4);
  h.command({type:'start'});h.advance(3400);press(a);b.axes[0]=.57;h.poll([a,b]);h.poll([a,b]);
  assert.equal(h.state.players[0].input.throttle,1);assert.equal(h.state.players[1].input.throttle,0);assert.ok(h.state.players[1].input.steer>.4);
  h.host.handle({type:'command',id:'phone',message:{type:'input',seq:1,throttle:1,steer:-1}});h.poll([a,b]);assert.equal(h.state.players.find(p=>p.id==='phone').input.steer,-1);
  const positions=h.state.players.map(p=>[p.id,p.x,p.z,p.score]);h.host.handle({type:'set-code',code:'ABC'});assert.equal(h.state.code,'ABC');assert.deepEqual(h.state.players.map(p=>[p.id,p.x,p.z,p.score]),positions);
});

test('disconnect releases held inputs; reused browser indices require an explicit reclaim and retain the existing player',()=>{
  const h=harness(),a=pad(0);h.poll([a]);press(a);h.poll([a]);press(a,0,false);h.poll([a]);h.command({type:'start'});h.advance(3400);press(a);h.poll([a]);h.poll([a]);const id=h.state.players[0].id;
  h.poll([]);assert.equal(h.state.players[0].connected,false);assert.equal(h.manager.slots.get(id).device,null);
  const replacement=pad(0,'Xbox');h.poll([replacement]);press(replacement);h.poll([replacement]);assert.equal(h.manager.pendingDevice,0);assert.equal(h.state.players.length,1);assert.equal(h.state.players[0].connected,false);
  assert.equal(h.manager.reclaim(id),true);h.poll([replacement]);assert.equal(h.state.players[0].id,id);assert.equal(h.state.players[0].connected,true);assert.equal(h.state.players[0].input.throttle,0,'held join button cannot accelerate the reclaimed car');
  press(replacement,0,false);h.poll([replacement]);press(replacement);h.poll([replacement]);assert.equal(h.state.players[0].input.throttle,1);
});

test('focus loss releases every player and requires controls to rest before resuming',()=>{
  const h=harness(),a=pad(0);h.poll([a]);press(a);h.poll([a]);press(a,0,false);h.poll([a]);h.command({type:'start'});h.advance(3400);press(a);h.poll([a]);h.poll([a]);
  h.poll([a],{active:false});h.poll([a],{active:false});assert.equal(h.state.players[0].input.throttle,0);
  h.poll([a]);assert.equal(h.state.players[0].input.throttle,0);press(a,0,false);h.poll([a]);press(a);h.poll([a]);assert.equal(h.state.players[0].input.throttle,1);
});

test('unknown controllers are offered configuration, disconnected slots expire, and mapping profiles can be saved',()=>{
  const h=harness(),a=pad(0,'Unknown','');h.poll([a]);press(a);h.poll([a]);assert.equal(h.configured.length,1);assert.equal(h.state.players.length,0);
  assert.equal(h.manager.setMapping(0,STANDARD_MAPPING),true);press(a,0,false);h.poll([a]);press(a);h.poll([a]);assert.equal(h.state.players[0].name,'Controller 1');
  h.poll([]);h.advance(20001);h.poll([]);assert.equal(h.state.players.length,0);assert.equal(h.manager.slots.size,0);
});

test('high refresh polling stays below the transport input budget while release and ready actions remain immediate',()=>{
  const sent=[];let serial=0;const m=new LocalControllers({uuid:()=>String(++serial),join:slot=>m.receive(slot.id,{type:'welcome',seq:0}),send:(id,msg)=>sent.push(msg),disconnect:()=>{},remove:()=>{}});
  const a=pad(0),state={phase:'lobby',players:[]};m.poll([a],{state,now:0});press(a);m.poll([a],{state,now:1});press(a,0,false);m.poll([a],{state,now:2});const id=[...m.slots.keys()][0];state.phase='racing';state.players=[{id}];press(a);
  for(let i=0;i<240;i++)m.poll([a],{state,now:100+i*1000/240});assert.ok(sent.filter(m=>m.type==='input').length<=61);
  press(a,0,false);m.poll([a],{state,now:1101});assert.equal(sent.at(-1).throttle,0);
  state.phase='finished';state.round=1;press(a,9);m.poll([a],{state,now:1102});assert.equal(sent.at(-1).type,'ready');
});


test('a native disconnect event prevents a replacement at the same browser index inheriting the car',()=>{
  const h=harness(),a=pad(0);h.poll([a]);press(a);h.poll([a]);const id=h.state.players[0].id;
  h.manager.disconnected(0,h.now);assert.equal(h.state.players[0].connected,false);
  const replacement=pad(0);press(replacement);h.poll([replacement]);assert.equal(h.manager.pendingDevice,0);assert.equal(h.manager.slots.get(id).device,null);
});
