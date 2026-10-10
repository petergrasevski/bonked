import test from 'node:test';
import assert from 'node:assert/strict';
import {SEGMENTS,trackAt,OBSTACLES,constrainObstacles,spawnCar,stepCar,NEUTRAL,PICKUP_LOCATIONS,CAR_LENGTH,CAR_WIDTH,PLAZAS} from '../shared/game.js';
import {engineAudible} from '../public/audio.js';
test('road widens continuously and plazas leave a full passing lane on both sides',()=>{
  assert.ok(Math.max(...SEGMENTS.map(s=>s.halfWidth))>11.9);
  for(const s of SEGMENTS)assert.ok(Math.abs(s.nextHalfWidth-s.halfWidth)<.55,'no abrupt road steps');
  for(const f of PLAZAS)assert.ok(trackAt(f).halfWidth>11.9);
  for(const o of OBSTACLES){assert.ok(trackAt(o.fraction).halfWidth-o.radius>CAR_WIDTH*3);for(const p of PICKUP_LOCATIONS)assert.ok(Math.hypot(p.x-o.x,p.z-o.z)>o.radius+1.5);}
});
test('solid traffic islands stop head-on impacts and damage the chassis, while airborne cars pass above',()=>{
  const o=OBSTACLES[0],p=trackAt(o.fraction),car={...spawnCar(),angle:p.angle,x:o.x-Math.cos(p.angle)*(o.radius+CAR_LENGTH/2-.2),z:o.z-Math.sin(p.angle)*(o.radius+CAR_LENGTH/2-.2),vx:Math.cos(p.angle)*20,vz:Math.sin(p.angle)*20};
  const air={...car,y:2};constrainObstacles(car);assert.ok(car.health<100&&car.health>94);assert.ok(car.vx*Math.cos(p.angle)+car.vz*Math.sin(p.angle)<0);assert.ok(Math.hypot(car.x-o.x,car.z-o.z)>=o.radius+CAR_LENGTH/2);
  constrainObstacles(air);assert.equal(air.health,100);assert.equal(air.y,2);
});
test('every traffic island blocks a top-speed approach from either direction',()=>{
  for(const o of OBSTACLES)for(const side of [-1,1]){
    const p=trackAt(o.fraction),dx=Math.cos(p.angle)*side,dz=Math.sin(p.angle)*side;
    const car={...spawnCar(),angle:p.angle+(side<0?Math.PI:0),x:o.x-dx*7,z:o.z-dz*7,vx:dx*36,vz:dz*36,trackFraction:o.fraction};
    for(let i=0;i<20;i++)stepCar(car,{...NEUTRAL,throttle:1});
    assert.ok((car.x-o.x)*dx+(car.z-o.z)*dz<0,`${o.id}: car passed through`);
    assert.ok(car.health<100,`${o.id}: impact must damage the car`);
  }
});
test('engine is silent for gone cars, finished races, stale snapshots and hidden/disconnected pages',()=>{
  const car=spawnCar();assert.equal(engineAudible('racing',car,true,true,true),true);
  for(const flag of ['eliminated','wrecked','falling','finished'])assert.equal(engineAudible('racing',{...car,[flag]:true},true,true,true),false);
  for(const args of [['lobby',car,true,true,true],['racing',null,true,true,true],['racing',car,false,true,true],['racing',car,true,false,true],['racing',car,true,true,false]])assert.equal(engineAudible(...args),false);
});
