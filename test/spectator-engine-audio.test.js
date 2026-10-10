import test from 'node:test';
import assert from 'node:assert/strict';
import {EngineAudio,engineParameters,raceListener} from '../public/engine-audio.js';
import {WeaponAudio,soundPosition} from '../public/weapon-audio.js';
function context(){
  const param=()=>({value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}});
  const nodes=[];const node=()=>{const n={gain:param(),frequency:param(),pan:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){this.disconnected=true;},setPeriodicWave(){},start(){this.started=true;},stop(){this.stopped=true;}};nodes.push(n);return n;};
  return {nodes,currentTime:0,sampleRate:48000,destination:{},createGain:node,createDynamicsCompressor:node,createOscillator:node,createBufferSource:node,createBiquadFilter:node,createStereoPanner:node,createPeriodicWave:()=>({}),createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)})};
}
const car=(id,x=0)=>({id,x,z:0,y:0,angle:0,vx:20,vz:0,input:{throttle:1},health:100});
const state=(players)=>({code:'ABC',round:1,phase:'racing',time:100,players,sounds:[],camera:{x:205,z:0,angle:0}});

test('spectator listens to the moving pack, never the abandoned local wreck',()=>{
  const dead={...car('self',0),eliminated:true},s=state([dead,car('rival',200)]),view={x:201,z:3,angle:Math.PI/2};
  const listener=raceListener(s,view);assert.deepEqual(listener,{...view,y:0});assert.ok(soundPosition(s.players[1],listener).volume>.9);
  assert.equal(raceListener(s).x,205);delete s.camera;assert.equal(raceListener(s).x,200);s.players=[];assert.equal(raceListener(s),null);
});
test('all live engines and opponents weapons remain audible after local death',()=>{
  const ctx=context(),engines=new EngineAudio(ctx),weapons=new WeaponAudio(ctx),s=state([{...car('self'),eliminated:true},car('a',200),car('b',208)]);s.players[1].firing='taser';s.sounds=[{id:1,kind:'plasma',x:200,z:0,at:100}];
  const listener=raceListener(s);engines.update(s,listener,true);weapons.update(s,listener,true);
  assert.deepEqual([...engines.engines.keys()],['a','b']);assert.ok([...engines.engines.values()].every(e=>e.level.gain.value>.01));assert.equal(weapons.voices.size,2);assert.equal(weapons.loops.size,1);
  s.players[1].eliminated=true;engines.update(s,listener,true);assert.deepEqual([...engines.engines.keys()],['b']);
});
test('engine gears drop revs on an upshift and have downshift hysteresis',()=>{
  const a=engineParameters({...car('a'),vx:9.9},0),b=engineParameters({...car('a'),vx:10.1},a.gear);assert.equal(a.gear,0);assert.equal(b.gear,1);assert.ok(b.rpm<a.rpm-1000);assert.equal(b.shifted,true);
  assert.equal(engineParameters({...car('a'),vx:9.8},1).gear,1);assert.equal(engineParameters({...car('a'),vx:7.9},1).gear,0);
  const idle=engineParameters({...car('a'),vx:0,input:{throttle:0}});assert.equal(idle.rpm,850);assert.equal(idle.load,0);assert.ok(engineParameters({...car('a'),vx:100}).rpm<=6700);
});
test('engine mix is bounded to nearby running cars and responds to throttle',()=>{
  const ctx=context(),fx=new EngineAudio(ctx),s=state([car('a',200),{...car('far',400)}, {...car('wreck',200),wrecked:true},{...car('fall',200),falling:true},{...car('done',200),finished:true}]);
  fx.update(s,raceListener(s),true);assert.equal(fx.engines.size,1);const e=fx.engines.get('a'),loaded=e.level.gain.value,filter=e.filter.frequency.value;ctx.currentTime=1;s.players[0].input.throttle=0;fx.update(s,raceListener(s),true);assert.ok(e.level.gain.value<loaded);assert.ok(e.filter.frequency.value<filter);assert.equal(fx.engines.get('a'),e);
});
test('mute, stale/disconnected state, hidden pages, round changes and leaving stop all engines',()=>{
  const ctx=context(),fx=new EngineAudio(ctx),s=state([car('a',200)]);fx.update(s,raceListener(s),true);const initial=fx.engines.get('a');fx.update(s,raceListener(s),false);assert.equal(fx.engines.size,0);assert.equal(initial.exhaust.stopped,true);
  fx.update(s,raceListener(s),true);const restarted=fx.engines.get('a');assert.notEqual(restarted,initial);s.round++;fx.update(s,raceListener(s),true);assert.equal(restarted.exhaust.stopped,true);
  s.phase='finished';fx.update(s,raceListener(s),true);assert.equal(fx.engines.size,0);fx.update(null,null,false);assert.equal(fx.room,null);
});
