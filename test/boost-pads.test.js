import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,BOOST_PADS,spawnCar,stepCar,trackAt,TOP_SPEED,CAR_WIDTH,STEP,NEUTRAL,OBSTACLES,constrainObstacles,PICKUP_LOCATIONS} from '../shared/game.js';
import {collectBoostPad,PAD_DURATION,boostExhaustStrength} from '../shared/boost-pads.js';
import {buildBoostPads,padAnimationPhase} from '../public/boost-pads.js';
import {DESERT_NARROW,DESERT_JUMPS} from '../shared/desert-features.js';
const at=p=>({...spawnCar(),x:p.x,y:p.y,z:p.z,groundY:p.y,angle:p.angle,trackFraction:p.fraction,pitch:Math.atan(p.grade||0),vx:Math.cos(p.angle)*20,vz:Math.sin(p.angle)*20});
test('authored boost layouts fit roads, use 1.5 car widths, and have the requested ice configurations',()=>{
  for(const id of ['coast','ice','desert']){selectTrack(id);assert.ok(BOOST_PADS.length>=10);for(const p of BOOST_PADS){assert.equal(p.width,CAR_WIDTH*1.5);assert.ok(Math.abs(p.lateral)+p.width/2<trackAt(p.fraction).halfWidth);assert.equal(p.y,trackAt(p.fraction).y);}}
  selectTrack('ice');const rows=Map.groupBy(BOOST_PADS,p=>p.fraction);assert.deepEqual([...rows.values()].map(p=>p.length),[2,2,2,5]);
  const [pair,opposite,middle]=[...rows.values()];assert.ok(pair.every(p=>p.lateral>0));assert.ok(opposite[0].lateral*opposite[1].lateral<0);assert.ok(middle.every(p=>Math.abs(p.lateral)<2));
});
test('a pad has a shared one-second cooldown, rejects stacked boosts, and is isolated per room',()=>{
  selectTrack('desert');const p=BOOST_PADS[0],pads=BOOST_PADS.map(p=>({...p})),otherRoom=BOOST_PADS.map(p=>({...p})),a=at(p),b=at(p);
  assert.equal(collectBoostPad(a,pads,10)?.id,p.id);assert.equal(a.padBoostRemaining,PAD_DURATION);assert.equal(pads[0].readyAt,11);
  assert.equal(collectBoostPad(b,pads,10.99),null);assert.equal(collectBoostPad(at(p),otherRoom,10)?.id,p.id);
  assert.equal(collectBoostPad(a,pads,11),null);assert.equal(pads[0].readyAt,11,'boosted car does not consume an available pad');assert.equal(collectBoostPad(b,pads,11)?.id,p.id);
  const launch=at(p);launch.boost=.5;assert.equal(collectBoostPad(launch,otherRoom,12),null);
});
test('pad contacts sweep through fast crossings and reject flying cars and other decks',()=>{
  selectTrack('desert');const p=BOOST_PADS[2],c=Math.cos(p.angle),s=Math.sin(p.angle),pads=BOOST_PADS.map(p=>({...p}));
  const before={x:p.x-c*8,z:p.z-s*8,y:p.y-8*p.grade},after={...at(p),x:p.x+c*8,z:p.z+s*8,y:p.y+8*p.grade};
  assert.equal(collectBoostPad(after,pads,1,before)?.id,p.id);
  for(const change of [{y:p.y+4},{y:p.y-20},{eliminated:true},{falling:true},{overturned:true}])assert.equal(collectBoostPad({...at(p),...change},BOOST_PADS.map(p=>({...p})),1),null);
});
test('boost ramps to 150% speed in 0.4 seconds, decays over two seconds and preserves prediction state',()=>{
  selectTrack('coast');const p=BOOST_PADS[0],car=at(p),pads=BOOST_PADS.map(p=>({...p}));collectBoostPad(car,pads,0);let predicted=JSON.parse(JSON.stringify(car)),peak=0,last=20;
  for(let i=1;i<=144;i++){
    // A test lane isolates boost acceleration from corners, falls and crashes.
    for(const c of [car,predicted]){c.x=p.x;c.z=p.z;c.y=p.y;c.groundY=p.y;c.angle=p.angle;stepCar(c,{...NEUTRAL,throttle:1});}
    const speed=Math.hypot(car.vx,car.vz);assert.ok(Math.abs(speed-Math.hypot(predicted.vx,predicted.vz))<1e-10);
    if(i<=24){assert.ok(speed>=last-1e-8);assert.ok(Math.abs(speed-(20+(54-20)*i/24))<1e-8,'linear acceleration');}else assert.ok(speed<=last+1e-8);
    if(i===24)assert.ok(Math.abs(speed-TOP_SPEED*1.5)<1e-8);peak=Math.max(peak,speed);last=speed;
    if(i%3===0)predicted=JSON.parse(JSON.stringify(car));
  }
  assert.ok(Math.abs(last-TOP_SPEED)<1e-8);assert.ok(car.padBoostRemaining<1e-12);assert.ok(peak<=54.000001);
});
test('pad rendering uses three instanced draws and dims a used pad',()=>{
  selectTrack('ice');const scene=new THREE.Scene(),visual=buildBoostPads(scene);assert.equal(scene.children.length,3);assert.equal(visual.base.count,BOOST_PADS.length);
  const bright=new THREE.Color();visual.chevrons.getColorAt(0,bright);visual.update({raceTime:.5,boostPads:[{id:BOOST_PADS[0].id,readyAt:1}]},500);const dark=new THREE.Color();visual.chevrons.getColorAt(0,dark);assert.ok(dark.g<bright.g);
  const matrix=new THREE.Matrix4();visual.glow.getMatrixAt(0,matrix);assert.equal(matrix.elements[0],0);visual.update({raceTime:1,boostPads:[{id:BOOST_PADS[0].id,readyAt:1}]},1000);visual.chevrons.getColorAt(0,dark);assert.ok(dark.equals(bright));
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
test('desert narrows to half-width after the final pickup, widens before finish, and cactus trunks block cars',()=>{
  selectTrack('desert');const n=DESERT_NARROW;assert.ok(n.start>Math.max(...PICKUP_LOCATIONS.map(p=>p.fraction)));assert.ok(n.narrowEnd<DESERT_JUMPS.at(-1).fraction);
  assert.equal(trackAt(n.start-.002).halfWidth,9);assert.ok(Math.abs(trackAt((n.narrowStart+n.narrowEnd)/2).halfWidth-4.5)<1e-8);assert.equal(trackAt(n.end+.002).halfWidth,9);
  for(let f=n.start;f<n.end;f+=.0005)assert.ok(Math.abs(trackAt(f).halfWidth-trackAt(f+.0005).halfWidth)<.15);
  for(const o of OBSTACLES){assert.equal(o.kind,'cactus');const p=trackAt(o.fraction),car={...at({...p,fraction:o.fraction}),x:o.x-Math.cos(p.angle)*2.9,z:o.z-Math.sin(p.angle)*2.9};constrainObstacles(car);assert.ok(car.health<100);assert.ok(Math.hypot(car.vx,car.vz)<20);const above={...car,x:o.x,z:o.z,y:o.y+9};constrainObstacles(above);assert.equal(above.x,o.x);assert.equal(above.z,o.z);}
});

test('removed risky pad rows stay absent and arrows advance at three frames per second',()=>{
  selectTrack('coast');assert.ok(BOOST_PADS.every(p=>p.fraction>.04));selectTrack('desert');assert.ok(BOOST_PADS.every(p=>p.fraction<.77||p.fraction>.81));
  assert.equal(padAnimationPhase(0),padAnimationPhase(320));assert.ok(padAnimationPhase(334)>padAnimationPhase(0));assert.ok(padAnimationPhase(667)>padAnimationPhase(334));assert.equal(padAnimationPhase(1000),0);
  assert.equal(boostExhaustStrength(0),0);assert.equal(boostExhaustStrength(2),1);assert.ok(boostExhaustStrength(1)<boostExhaustStrength(1.5));assert.ok(boostExhaustStrength(.1)<.01);
});
