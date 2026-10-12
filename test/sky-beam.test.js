import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,spawnCar,trackAt,START_FRACTION,NEUTRAL,SEGMENTS} from '../shared/game.js';
import {createChase} from '../shared/chase.js';
import {updateSkyBeams,resetSkyBeams,sanitizeSkyAim,SKY_DELAY,SKY_COOLDOWN} from '../shared/sky-beam.js';
import {skyGroundAt,skyRayGround,skyPatch} from '../shared/sky-ground.js';
import {pulsePush,PULSE_RADIUS} from '../shared/shockwave.js';
import * as THREE from 'three';
import {SkyBeamView,advanceSkyCursor} from '../public/sky-beam.js';
import {readController} from '../public/controller.js';
import {joystickVector} from '../public/touch-controls.js';
function scene(){
  selectTrack('coast');const at=trackAt(.025),caster={id:'caster',color:'#ff5555',car:{...spawnCar(),eliminated:true},input:{...NEUTRAL},skyAim:{x:at.x,z:at.z}};
  const target={id:'target',color:'#5555ff',car:{...spawnCar(1),...at,progress:.025-START_FRACTION,x:at.x+at.nx*8,z:at.z+at.nz*8,health:53,vx:0,vz:0}};
  const room={phase:'racing',players:new Map([[caster.id,caster],[target.id,target]]),chase:createChase([target.car]),serial:0,effects:[],sounds:[]};updateSkyBeams(room,1000);return {room,caster,target,at};
}
test('eliminated players fire one fixed-position beam after 600ms, with the pulse push and no damage',()=>{
  const {room,caster,target,at}=scene();caster.input.fire=true;updateSkyBeams(room,1100);assert.equal(room.skyBeams.length,1);assert.equal(caster.skyCooldownUntil,1100+SKY_COOLDOWN);
  const strike={...room.skyBeams[0]};caster.skyAim={x:at.x+30,z:at.z+30};updateSkyBeams(room,1100+SKY_DELAY-1);assert.equal(target.car.vx,0);assert.equal(room.effects.length,0);
  updateSkyBeams(room,1100+SKY_DELAY);assert.equal(target.car.health,53);assert.ok(Math.abs(Math.hypot(target.car.vx,target.car.vz)-pulsePush(8))<1e-8);assert.equal(room.effects.length,1);assert.equal(room.effects[0].radius,PULSE_RADIUS);assert.equal(room.effects[0].color,caster.color);assert.equal(room.effects[0].x,strike.x);assert.equal(room.effects[0].z,strike.z);
  const vx=target.car.vx;updateSkyBeams(room,1800);assert.equal(target.car.vx,vx);assert.equal(room.effects.length,1);
  caster.input.fire=false;updateSkyBeams(room,2000);caster.input.fire=true;updateSkyBeams(room,2100);assert.equal(room.skyBeams.length,1);
  updateSkyBeams(room,5000);assert.equal(room.skyBeams.length,0,'holding fire cannot queue another shot');caster.input.fire=false;updateSkyBeams(room,5010);caster.input.fire=true;updateSkyBeams(room,5020);assert.equal(room.skyBeams.length,1);
});
test('sky beams respect shields, vertical separation, racing phase and elimination eligibility',()=>{
  for(const flag of ['shield','finished','eliminated','falling','otherDeck','outOfRange']){
    const {room,caster,target}=scene();if(flag==='otherDeck')target.car.y+=5;else if(flag==='outOfRange')target.car.x+=100;else target.car[flag]=true;
    caster.input.fire=true;updateSkyBeams(room,1100);updateSkyBeams(room,1700);assert.equal(target.car.vx,0,flag);assert.equal(target.car.vz,0,flag);assert.equal(target.car.health,53);
  }
  const {room,caster}=scene();caster.car.eliminated=false;caster.input.fire=true;updateSkyBeams(room,1100);assert.equal(room.skyBeams.length,0);assert.equal(caster.skyTarget,null);
  caster.car.eliminated=true;room.phase='finished';updateSkyBeams(room,1200);assert.equal(room.skyBeams.length,0);
});
test('target input is finite, bounded near the race, and ignores claimed height',()=>{
  for(const aim of [null,{}, {x:NaN,z:0},{x:0,z:Infinity},{x:'4',z:5}])assert.equal(sanitizeSkyAim(aim),null);
  assert.deepEqual(sanitizeSkyAim({x:4,z:5,y:999}),{x:4,z:5});const {room,caster,target}=scene();caster.skyAim={x:1e10,z:-1e10,y:1e5};updateSkyBeams(room,1200);
  assert.ok(Math.hypot(caster.skyTarget.x-target.car.x,caster.skyTarget.z-target.car.z)<150);assert.equal(caster.skyTarget.y,skyGroundAt(caster.skyTarget.x,caster.skyTarget.z).y);
});
test('ground queries use upper bridge decks, ice gaps, and sloping desert surfaces',()=>{
  for(const track of ['coast','ice','desert']){selectTrack(track);for(const f of [.02,.18,.25,.36,.7]){const p=trackAt(f),g=skyGroundAt(p.x,p.z),hit=skyRayGround({x:p.x,y:100,z:p.z},{x:0,y:-1,z:0});assert.ok(Math.abs(hit.y-g.y)<1e-8);assert.ok(skyPatch(p.x,p.z).every(Number.isFinite));}
    if(track==='ice')assert.equal(skyGroundAt(0,-40).y,-4);
    if(track==='desert'){const p=trackAt(.25);assert.ok(skyGroundAt(p.x,p.z).y>35);}
  }
  selectTrack('desert');const crossing=SEGMENTS.filter(s=>Math.hypot(s.x,s.z)<10).sort((a,b)=>b.y-a.y)[0];assert.ok(skyGroundAt(crossing.x,crossing.z).y>=crossing.y-.1);
});
test('screen cursor remains stationary without input, is bounded, and has normalized joystick/controller axes',()=>{
  const cursor={x:.2,y:-.3};advanceSkyCursor(cursor,{x:0,y:0},1);assert.deepEqual(cursor,{x:.2,y:-.3});advanceSkyCursor(cursor,{x:1,y:1},.5);assert.ok(cursor.x>.2&&cursor.y>-.3);advanceSkyCursor(cursor,{x:1,y:1},100);assert.deepEqual(cursor,{x:.82,y:.76});
  assert.deepEqual(joystickVector(0,-30,30),{x:0,y:1});const diagonal=joystickVector(100,100,30);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.y)-1)<1e-8);
  const pad=readController([{connected:true,mapping:'standard',axes:[.8,-1],buttons:[]}]);assert.ok(pad.steer>0);assert.equal(pad.aimY,1);assert.equal(readController([]).aimY,0);
});

test('new rounds reset targeting, pending strikes and cooldowns',()=>{
  const {room,caster}=scene();caster.input.fire=true;updateSkyBeams(room,1100);resetSkyBeams(room);assert.equal(room.skyBeams.length,0);assert.equal(caster.skyTarget,null);assert.equal(caster.skyAim,null);assert.equal(caster.skyCooldownUntil,0);assert.equal(caster.skyFireLatch,false);
});
test('an idle target retains its screen position as the race camera translates and turns',()=>{
  selectTrack('desert');const p=trackAt(.665),view=new SkyBeamView(new THREE.Scene()),camera=new THREE.PerspectiveCamera(58,1.8,.1,1000),state={code:'test',round:1,phase:'racing',time:0,players:[{id:'me',eliminated:true,color:'#ff5555'}]};
  let previous;
  for(const angle of [0,.2,.5]){
    const x=p.x+angle*20,z=p.z+angle*10;camera.position.set(x-Math.cos(angle)*40,40,z-Math.sin(angle)*40);camera.lookAt(x,0,z);camera.updateMatrixWorld();
    view.update(state,'me',camera,{x,z,spread:0},{x:0,y:0},1/60);
    const target=new THREE.Vector3(view.aim.x,skyGroundAt(view.aim.x,view.aim.z).y,view.aim.z),screen=target.clone().project(camera);assert.ok(Math.abs(screen.x)<.0001&&Math.abs(screen.y)<.0001);
    if(previous)assert.ok(target.distanceTo(previous)>1);previous=target;
  }
  view.update(null,'me',camera,{}, {x:0,y:0},1/60);assert.equal(view.targets.size,0);assert.equal(view.aim,null);
});

test('eliminated bots never receive targets or fire sky beams',()=>{
  const {room,caster}=scene();caster.bot=true;caster.input.fire=true;
  for(const now of [1100,1800,5000])updateSkyBeams(room,now);
  assert.equal(caster.skyTarget,null);assert.equal(room.skyBeams.length,0);assert.equal(room.effects.length,0);
});
test('other players see human spectator targets and their cooldown, but never bot targets',()=>{
  selectTrack('coast');const at=trackAt(.025),view=new SkyBeamView(new THREE.Scene()),camera=new THREE.PerspectiveCamera();
  const remote={id:'remote',eliminated:true,color:'#ff5555',skyTarget:{x:at.x,z:at.z},skyCooldownUntil:2000};
  const state={phase:'racing',time:1000,players:[{id:'me',eliminated:false},remote,{...remote,id:'bot',bot:true}]};
  view.update(state,'me',camera,{}, {x:0,y:0},1/60);
  assert.deepEqual([...view.targets.keys()],['remote']);assert.equal(view.aim,null);
  const marker=view.targets.get('remote');assert.equal(marker.material.uniforms.opacity.value,.18);
  assert.equal(marker.material.uniforms.center.value.x,remote.skyTarget.x);
  remote.skyTarget.x+=2;state.time=2000;view.update(state,'me',camera,{}, {x:0,y:0},1/60);
  assert.equal(marker.material.uniforms.center.value.x,remote.skyTarget.x);assert.equal(marker.material.uniforms.opacity.value,.5);
  view.update(null,'me',camera,{}, {x:0,y:0},1/60);assert.equal(view.targets.size,0);
});
