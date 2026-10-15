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

const pair=index=>({...pad(index,'Joy-Con (L/R)'),axes:[0,0,0,0]});
test('combined Joy-Cons join as two independently driven sideways controllers',()=>{
  const h=harness(),joy=pair(0);h.poll([joy]);assert.equal(h.manager.devices.get(0).canSplit,true);
  press(joy,1);h.poll([joy]);assert.equal(h.state.players.length,1);
  assert.equal(h.manager.setJoyConSplit(0),true);assert.equal(h.state.players.length,0);
  press(joy,1,false);h.poll([joy]);assert.equal(h.manager.devices.size,2);
  press(joy,14);h.poll([joy]);assert.equal(h.state.players.length,1);assert.match(h.state.players[0].name,/Left/);
  press(joy,1);h.poll([joy]);assert.equal(h.state.players.length,2);assert.match(h.state.players[1].name,/Right/);
  press(joy,14,false);press(joy,1,false);h.poll([joy]);h.command({type:'start'});h.advance(3400);
  joy.axes=[0,.7,0,.6];press(joy,14);h.poll([joy]);h.poll([joy]);
  assert.equal(h.state.players[0].input.throttle,1);assert.equal(h.state.players[1].input.throttle,0);
  assert.ok(h.state.players[0].input.steer>.6);assert.ok(h.state.players[1].input.steer<-.5);
  assert.equal(h.manager.setJoyConSplit(0,false),false,'player count cannot change during racing');
  h.manager.disconnectPhysical(0,h.now);assert.equal(h.manager.devices.size,0);assert.ok(h.state.players.every(p=>!p.connected));
  h.poll([joy]);assert.equal(h.manager.devices.size,2,'split preference survives reconnect');
  h.poll([]);h.advance(20001);h.poll([]);assert.equal(h.state.players.length,0);
});
test('Joy-Con pairing can be restored in the lobby without ghost players or affecting other gamepads',()=>{
  const h=harness(),joy=pair(2),other=pad(0);h.poll([joy,other]);h.manager.setJoyConSplit(2);h.poll([joy,other]);
  press(joy,14);press(joy,1);press(other);h.poll([joy,other]);assert.equal(h.state.players.length,3);
  assert.equal(h.manager.setJoyConSplit(-3,false),true);h.poll([joy,other]);assert.equal(h.state.players.length,2);
  // The held right face button joins the recombined pad, once; the other pad retains its car.
  assert.equal(h.manager.devices.size,2);assert.equal(h.manager.devices.get(0).label,'DualSense');
  assert.equal(h.manager.devices.get(2).canSplit,true);assert.equal(h.manager.joyConPairs.size,0);
});
test('only recognized standard combined Joy-Con layouts offer splitting',()=>{
  const h=harness(),single=pad(0,'Joy-Con (L)'),unknown={...pair(1),mapping:''};h.poll([single,unknown]);
  assert.equal(h.manager.devices.get(0).canSplit,false);assert.equal(h.manager.devices.get(1).canSplit,false);
  assert.equal(h.manager.setJoyConSplit(0),false);
});

test('steering is forwarded between heartbeat ticks and remains below the host command budget',()=>{
  const sent=[];const manager=new LocalControllers({uuid:()=>1,join:s=>manager.receive(s.id,{type:'welcome'}),send:(id,msg)=>sent.push(msg),disconnect:()=>{},remove:()=>{}});
  const a=pad(0),state={phase:'lobby',players:[]};manager.poll([a],{state,now:0});press(a);manager.poll([a],{state,now:1});press(a,0,false);manager.poll([a],{state,now:2});
  const slot=[...manager.slots.values()][0];state.phase='racing';state.players=[{id:slot.id}];manager.poll([a],{state,now:20});sent.length=0;
  a.axes[0]=.8;manager.poll([a],{state,now:28});assert.equal(sent.length,1);assert.ok(sent[0].steer>.7,'steering need not wait until the next 60 Hz heartbeat');
  for(let i=0;i<240;i++){a.axes[0]=Math.sin(i*.1);manager.poll([a],{state,now:40+i*1000/240});}
  assert.ok(sent.length<130,'continuous axis motion on a 240 Hz display stays below the 150-command host limit');
  assert.equal(slot.controllerLabel,'DualSense');
});

test('eliminated gamepads send screen movement rather than fixed world aim coordinates',()=>{
  const sent=[];const manager=new LocalControllers({uuid:()=>1,join:s=>manager.receive(s.id,{type:'welcome'}),send:(id,msg)=>sent.push(msg),disconnect:()=>{},remove:()=>{}}),a=pad(0),state={phase:'lobby',players:[]};
  manager.poll([a],{state,now:0});press(a);manager.poll([a],{state,now:1});press(a,0,false);manager.poll([a],{state,now:2});
  const id=[...manager.slots.keys()][0];state.phase='racing';state.players=[{id,eliminated:true,skyTarget:{x:900,z:800}}];state.camera={x:900,z:800,angle:1};a.axes=[.8,-.8];manager.poll([a],{state,now:30});
  const input=sent.at(-1);assert.ok(input.skyMove.x>.7&&input.skyMove.y>.7);assert.equal(input.skyAim,undefined);assert.equal(input.steer,0);assert.equal(input.throttle,0);
});
