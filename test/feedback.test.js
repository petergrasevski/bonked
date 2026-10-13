import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,trackAt,nearestTrack,iceSplit,hasBarrier,constrainRoad,spawnCar,stepCar,NEUTRAL,STEP,botInput,TOP_SPEED} from '../shared/game.js';
import {initCombat,giveWeapon,pressWeapon,updateCombat,TASER_RADIUS,WEAPON_IDS} from '../shared/combat.js';
import {projectilePose} from '../public/projectile-motion.js';
import {createPickupModel} from '../public/pickups.js';
import {WEAPON_SOUNDS,WeaponAudio,soundPosition} from '../public/weapon-audio.js';
const player=(id,x=0,z=0)=>({id,car:{...spawnCar(),x,z,angle:0},input:{...NEUTRAL},fireLatch:false});
const room=(...players)=>{const r={phase:'racing',startAt:0,players:new Map(players.map(p=>[p.id,p]))};initCombat(r);return r;};
const run=(r,seconds,offset=0)=>{for(let i=0;i<Math.round(seconds/STEP);i++)updateCombat(r,STEP,offset+(i+1)*STEP*1000);};

test('ice forks retain guarded edges except the boost-fed first right branch',()=>{
  selectTrack('ice');assert.equal(iceSplit(0),4);assert.equal(iceSplit(130),0);
  for(const z of [-40,40])for(const side of [-1,1]){
    const center=nearestTrack(0,z);const make=(x,offset)=>{const p=nearestTrack(x,z);return {...spawnCar(),x:p.x+p.nx*offset,z:p.z+p.nz*offset,angle:Math.atan2(p.nz,p.nx)-Math.PI/2,trackFraction:p.fraction};};
    const exposedRight=z<0&&side>0;assert.equal(hasBarrier(center.fraction,side,true),!exposedRight);
    const lane=make(0,side*9);constrainRoad(lane);assert.equal(lane.falling,false);
    const wall=make(0,side*4.2);constrainRoad(wall);assert.equal(wall.falling,false);assert.ok(exposedRight?nearestTrack(wall.x,wall.z).distance<4.3:nearestTrack(wall.x,wall.z).distance>4.9);
    const gap=make(side<0?65:-65,side*2);constrainRoad(gap);assert.equal(gap.falling,true,'unguarded gap is not drivable');
    const exposed=make(side<0?65:-65,side*15);constrainRoad(exposed);assert.ok(exposed.falling||exposed.edgeBalance);for(let i=0;i<60;i++)stepCar(exposed,NEUTRAL);assert.equal(exposed.falling,true);
    const guarded=make(side<0?-65:65,side*14.2);constrainRoad(guarded);assert.equal(guarded.falling,false);if(exposedRight)assert.equal(guarded.edgeBalance,true);
  }
});
test('ice rematch grids stay inside both lanes even when the winner stops at a split',()=>{
  selectTrack('ice');for(const x of [-65,0,65])for(const z of [-40,40]){const fraction=nearestTrack(x,z).fraction;for(let slot=0;slot<6;slot++){const c=spawnCar(slot,fraction);stepCar(c,NEUTRAL);assert.equal(c.falling,false);assert.equal(c.health,100);}}
});
test('landing deep inside the crevasse or beyond a barrier falls instead of teleporting back',()=>{
  selectTrack('ice');const p=nearestTrack(0,-40);const gap={...spawnCar(),x:p.x,z:p.z,trackFraction:p.fraction};constrainRoad(gap);assert.equal(gap.falling,true);
  const q=nearestTrack(-65,-40),outside={...spawnCar(),x:q.x-q.nx*20,z:q.z-q.nz*20,trackFraction:q.fraction};constrainRoad(outside);assert.equal(outside.falling,true);
});
test('bots can use either split lane for a complete ice lap',()=>{
  selectTrack('ice');for(const slot of [0,1]){const c=spawnCar(slot);for(let i=0;i<20000&&c.progress<1&&!c.eliminated;i++)stepCar(c,botInput(c));assert.ok(c.progress>=1);assert.equal(c.health,100);assert.equal(c.falling,false);}
});
test('full speed builds over several seconds, and steering adds modest speed loss',()=>{
  selectTrack('coast');const p=trackAt(.01);const speed=(steer,ticks,initial=0)=>{const c={...spawnCar(),vx:Math.cos(p.angle)*initial,vz:Math.sin(p.angle)*initial};let firstFull=null;
    for(let i=0;i<ticks;i++){Object.assign(c,{x:p.x,z:p.z,angle:p.angle,trackFraction:.01});stepCar(c,{...NEUTRAL,throttle:1,steer});if(Math.hypot(c.vx,c.vz)>=TOP_SPEED-.01&&firstFull===null)firstFull=(i+1)*STEP;}
    return {speed:Math.hypot(c.vx,c.vz),firstFull};};
  assert.ok(speed(0,60).speed<20);const full=speed(0,360);assert.ok(full.firstFull>3&&full.firstFull<5);assert.ok(Math.abs(full.speed-36)<.01);
  const turning=speed(.5,360,36).speed;assert.ok(turning>28&&turning<34);
});
test('taser uses exactly five seconds of held fuel, damages all close cars at 15HP/s, and stops on release',()=>{
  selectTrack('coast');const a=player('a'),b=player('b',5),c=player('c',-5),far=player('far',TASER_RADIUS+.01),shielded=player('shielded',0,5),bridge=player('bridge',0,6);shielded.car.shield=8;bridge.car.y=20;const r=room(a,b,c,far,shielded,bridge);giveWeapon(a.car,'taser');
  assert.equal(pressWeapon(r,a,0),false);run(r,1);assert.equal(a.car.ammo,5);a.input.fire=true;run(r,2,1000);
  assert.ok(Math.abs(a.car.ammo-3)<1e-8);assert.equal(b.car.health,70);assert.equal(c.car.health,70);assert.equal(a.car.health,100);assert.equal(far.car.health,100);assert.equal(shielded.car.health,100);assert.equal(bridge.car.health,100);assert.equal(r.arcs.length,2);assert.ok(b.car.tased>0);
  a.input.fire=false;run(r,1,3000);assert.equal(b.car.health,70);assert.equal(b.car.tased,0);assert.equal(r.arcs.length,0);assert.equal(a.car.firing,null);
  a.input.fire=true;run(r,4,4000);assert.equal(a.car.ammo,0);assert.equal(a.car.item,null);assert.ok(Math.abs(b.car.health-25)<1e-8);assert.equal(r.arcs.length,0);
});
test('taser releases cars leaving its radius and disrupts steering as well as lateral grip',()=>{
  selectTrack('coast');const a=player('a'),b=player('b',5),r=room(a,b);giveWeapon(a.car,'taser');a.input.fire=true;updateCombat(r,STEP,17);b.car.x=TASER_RADIUS+1;updateCombat(r,STEP,34);assert.equal(b.car.tased,0);assert.equal(r.arcs.length,0);
  const p=trackAt(.01),base={...spawnCar(),x:p.x,z:p.z,angle:p.angle,trackFraction:.01,vx:Math.cos(p.angle)*20-p.nx*6,vz:Math.sin(p.angle)*20-p.nz*6};
  const clean={...base},tased={...base,tased:1,tasePhase:.08};stepCar(clean,NEUTRAL);stepCar(tased,NEUTRAL);assert.notEqual(tased.angle,clean.angle);const slip=c=>Math.abs(-c.vx*Math.sin(c.angle)+c.vz*Math.cos(c.angle));assert.ok(slip(tased)>slip(clean));
  const copy={...base,tased:1,tasePhase:.08};stepCar(copy,NEUTRAL);assert.deepEqual(copy,tased);
});
test('taser can wreck a low-health car and cannot keep arcing to wrecks',()=>{
  const a=player('a'),b=player('b',5),r=room(a,b);b.car.health=1;giveWeapon(a.car,'taser');a.input.fire=true;run(r,.2);assert.equal(b.car.health,0);assert.equal(b.car.wrecked,true);assert.ok(r.sounds.some(s=>s.kind==='explosion'&&s.owner==='b'));assert.equal(r.arcs.length,0);
});
test('projectiles move every display frame without rewinding at 20Hz snapshots, including jitter',()=>{
  for(const hz of [60,120])for(const jitter of [false,true]){
    let pose=null,shot={x:0,y:.7,z:0,angle:0,speed:54},stamp=0,next=50;const deltas=[];
    for(let now=0;now<1500;now+=1000/hz){if(now>=next){stamp=next;shot={...shot,x:next*.054};next+=jitter?[35,65,45,55][Math.round(next/50)%4]:50;}const prior=pose;pose=projectilePose(pose,shot,stamp,1/hz,now);if(prior)deltas.push(pose.x-prior.x);}
    assert.ok(deltas.every(d=>d>.2&&d<1.5),`${hz} Hz range ${Math.min(...deltas)}–${Math.max(...deltas)}`);
  }
});
test('stale projectiles stop extrapolating; turning and teleports stay finite',()=>{
  const shot={x:0,z:0,angle:0,speed:54};let p=projectilePose(null,shot,1,STEP,0);
  for(let now=STEP*1000;now<1000;now+=STEP*1000)p=projectilePose(p,shot,1,STEP,now);assert.ok(Math.abs(p.x-8.1)<.01);
  p=projectilePose(p,{...shot,x:200,angle:Math.PI},2,STEP,1000);assert.equal(p.x,200);assert.ok(Number.isFinite(p.angle));
});
test('shotgun silhouette spans both sides; taser is tall and reflective stainless steel',()=>{
  const shotgun=createPickupModel('shotgun'),taser=createPickupModel('taser'),size=m=>new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  const s=size(shotgun),t=size(taser);assert.ok(s.z>s.x*2);assert.ok(t.y>t.x*1.5);assert.ok(taser.children.some(m=>m.material.metalness>.9&&m.material.roughness<.2));
});
// A small Web Audio fake checks scheduling and lifecycle, not the browser's DSP.
import {audioContext,audioBank} from './audio-helpers.js';
test('every weapon has a distinct sound, and distance reduces nearby weapon volume',()=>{
  const specs=WEAPON_IDS.map(id=>{assert.ok(WEAPON_SOUNDS[id]);return JSON.stringify(WEAPON_SOUNDS[id]);});assert.equal(new Set(specs).size,WEAPON_IDS.length);
  assert.equal(soundPosition({x:0,z:0},{x:0,z:0}).volume,1);assert.equal(soundPosition({x:100,z:0},{x:0,z:0}).volume,0);assert.ok(soundPosition({x:0,z:10},{x:0,z:0}).pan>0);
});
test('sound events deduplicate across snapshots and mute/room exit stops held effects',()=>{
  const ctx=audioContext(),fx=new WeaponAudio(ctx,{bank:audioBank()}),listener={x:0,z:0},state={code:'ABC',round:1,phase:'racing',time:100,sounds:[{id:1,kind:'plasma',x:0,z:0,at:100}],players:[]};
  fx.update(state,listener,true);assert.equal(fx.voices.size,1);fx.update({...state,time:150},listener,true);assert.equal(fx.voices.size,1);
  fx.update({...state,players:[{id:'a',x:0,z:0,firing:'taser'}]},listener,true);assert.equal(fx.loops.size,1);
  fx.update({...state,sounds:[{id:2,kind:'rocket',x:0,z:0,at:150}]},listener,false);assert.equal(fx.loops.size,0);assert.ok([...fx.voices].every(v=>v.stopped));const count=fx.voices.size;fx.update({...state,sounds:[{id:2,kind:'rocket',x:0,z:0,at:150}]},listener,true);assert.equal(fx.voices.size,count);
  fx.update(null,listener,false);assert.equal(fx.room,null);assert.equal(fx.seen.size,0);
});
test('server sound events describe real shots, reject cooldown presses, and expire',()=>{
  const a=player('a'),r=room(a);giveWeapon(a.car,'plasma');pressWeapon(r,a,100);assert.equal(r.sounds.length,1);assert.equal(r.sounds[0].kind,'plasma');assert.equal(r.sounds[0].owner,'a');pressWeapon(r,a,101);assert.equal(r.sounds.length,1);updateCombat(r,STEP,1700);assert.equal(r.sounds.length,0);
});
