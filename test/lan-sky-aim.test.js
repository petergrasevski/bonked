import test from 'node:test';
import assert from 'node:assert/strict';
import {LanHostSocket} from '../public/lan-host.js';
import {createPartyHost} from '../shared/party-host.js';
test('the LAN adapter accepts movement but always uses host-projected sky coordinates',t=>{
  const original=globalThis.Worker;globalThis.Worker=class{messages=[];postMessage(m){this.messages.push(m);}terminate(){}};t.after(()=>{globalThis.Worker=original;});
  const host=new LanHostSocket({});t.after(()=>host.close());host.localPlayers.add('pad');
  host.worker.onmessage({data:{type:'snapshot',state:{phase:'racing',round:1,trackId:'coast',players:[{id:'pad',eliminated:true,connected:true},{id:'phone',eliminated:true,connected:true},{id:'bot',eliminated:true,bot:true,connected:true}]},controllers:false}});
  host.sendLocal('pad',{type:'input',seq:1,skyMove:{x:2,y:NaN},skyAim:{x:999,z:999}});assert.equal(host.worker.messages.at(-1).message.skyAim,null);
  assert.deepEqual(host.skyControllers().get('pad'),{x:1,y:0});assert.deepEqual(host.skyControllers().get('phone'),{x:0,y:0});assert.equal(host.skyControllers().has('bot'),false);
  host.setSkyAims(new Map([['pad',{x:3,z:4}],['phone',{x:5,z:6}],['bot',{x:1,z:1}]]));assert.equal(host.worker.messages.at(-1).type,'sky-aims');assert.equal(host.worker.messages.at(-1).aims.length,2);
  host.sendLocal('pad',{type:'input',seq:2,skyMove:{x:0,y:0}});assert.deepEqual(host.worker.messages.at(-1).message.skyAim,{x:3,z:4});
  assert.deepEqual(host.skyControllers(performance.now()+2000).get('pad'),{x:0,y:0},'stale movement stops but keeps its camera-relative cursor');
});
test('host-projected LAN aim reaches the shared beam engine and a fired strike stays fixed',()=>{
  let now=1000,state;const host=createPartyHost({now:()=>now,post:m=>{if(m.type==='snapshot')state=m.state;}}),command=(id,message)=>host.handle({type:'command',id,message});
  host.handle({type:'create'});host.handle({type:'peer-open',id:'pad',name:'Pad'});command('lan-display',{type:'bot'});command('lan-display',{type:'bot'});command('lan-display',{type:'start'});
  for(let tick=0;tick<1200&&!state.players.find(p=>p.id==='pad').eliminated&&state.phase!=='finished';tick++){now+=1000/60;host.advance(1/60);}
  assert.equal(state.phase,'racing');assert.equal(state.players.find(p=>p.id==='pad').eliminated,true);
  const aim={x:state.camera.x,z:state.camera.z};command('pad',{type:'input',seq:1,fire:false});host.handle({type:'sky-aims',aims:[{id:'pad',aim}]});now+=17;host.advance(1/60);
  const target=state.players.find(p=>p.id==='pad').skyTarget;assert.ok(Math.hypot(target.x-aim.x,target.z-aim.z)<.001);
  command('pad',{type:'input',seq:2,fire:true,skyAim:aim});now+=17;host.advance(1/60);assert.equal(state.skyBeams.length,1);const strike={...state.skyBeams[0]};
  host.handle({type:'sky-aims',aims:[{id:'pad',aim:{x:aim.x+4,z:aim.z+4}}]});now+=17;host.advance(1/60);assert.equal(state.skyBeams[0].x,strike.x);assert.equal(state.skyBeams[0].z,strike.z);
});
