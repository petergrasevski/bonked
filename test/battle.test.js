import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnCar,trackAt,STEP,NEUTRAL,stepCar,resolveNudges,collideCars,CAR_WIDTH,PICKUP_LOCATIONS,PICKUP_ROW_COUNT,TRACK_LENGTH,TOP_SPEED,healthHandlingFactor,sanitizeInput} from '../shared/game.js';
import {predictFleet} from '../shared/prediction.js';
const at=(slot=0,side=0)=>{const p=trackAt(.1);return {...spawnCar(slot),x:p.x+p.nx*side,z:p.z+p.nz*side,angle:p.angle,trackFraction:.1};};
test('weapon rows offer 3–4 lanes across the road roughly ten seconds apart',()=>{
  assert.ok(Math.abs(TRACK_LENGTH/PICKUP_ROW_COUNT/TOP_SPEED-10)<1);
  for(let row=0;row<PICKUP_ROW_COUNT;row++){
    const items=PICKUP_LOCATIONS.filter(p=>p.row===row);assert.ok(items.length>=3&&items.length<=4);
    const road=trackAt(items[0].fraction),offsets=items.map(p=>(p.x-road.x)*road.nx+(p.z-road.z)*road.nz);
    assert.ok(offsets[0]<-3&&offsets.at(-1)>3);assert.ok(Math.abs(offsets[0]+offsets.at(-1))<1e-6);
    assert.ok(offsets.every(x=>Math.abs(x)<road.halfWidth-CAR_WIDTH/2));
  }
});
test('a nudge moves one car width in 0.2s, requires release, and enforces cooldown',()=>{
  for(const direction of [-1,1]){
    const car=at(),p=trackAt(.1),start={x:car.x,z:car.z};
    for(let i=0;i<12;i++)stepCar(car,{...NEUTRAL,nudge:direction});
    const travelled=(car.x-start.x)*p.nx+(car.z-start.z)*p.nz;assert.ok(Math.abs(travelled-direction*CAR_WIDTH)<.01);
    const after={x:car.x,z:car.z};for(let i=0;i<70;i++)stepCar(car,{...NEUTRAL,nudge:direction});assert.ok(Math.hypot(car.x-after.x,car.z-after.z)<.01);
    stepCar(car,NEUTRAL);stepCar(car,{...NEUTRAL,nudge:direction});assert.ok(car.nudgeTime>0);
  }
  const car=at();stepCar(car,{...NEUTRAL,nudge:1});stepCar(car,NEUTRAL);stepCar(car,{...NEUTRAL,nudge:-1});assert.equal(car.nudgeDirection,1);
  for(const value of [2,Infinity,'left',null])assert.equal(sanitizeInput({nudge:value}).nudge,0);
});
test('nudging an adjacent car deals eight damage once, pushes it sideways and turns it away',()=>{
  const a=at(0,-2.3),b=at(1,0),p=trackAt(.1),start={x:b.x,z:b.z};
  for(let i=0;i<28;i++){stepCar(a,{...NEUTRAL,nudge:1});stepCar(b,NEUTRAL);resolveNudges([a,b]);collideCars([a,b],{road:true});}
  assert.equal(b.health,92);const moved=(b.x-start.x)*p.nx+(b.z-start.z)*p.nz;
  assert.ok(moved>CAR_WIDTH*1.5&&moved<CAR_WIDTH*2.1,`shove distance ${moved}`);assert.ok(b.angle>p.angle+.1);
});
test('nudge prediction responds immediately without applying authoritative damage',()=>{
  const a=at(0,-2.3),b=at(1,0);for(let i=0;i<5;i++)predictFleet(a,[b],{...NEUTRAL,nudge:1},STEP);
  assert.equal(b.health,100);assert.ok(b.shoveTime>0);assert.ok(a.nudgeCooldown>0);
  const shielded=at(1,0);shielded.shield=8;const attacker=at(0,-2.3);for(let i=0;i<12;i++){stepCar(attacker,{...NEUTRAL,nudge:1});resolveNudges([attacker,shielded]);}assert.equal(shielded.health,100);assert.equal(shielded.shoveTime,0);
});
test('damage reduces grip and steering authority independently of the smaller speed penalty',()=>{
  assert.equal(healthHandlingFactor(100),1);assert.equal(healthHandlingFactor(1),.4);
  const healthy=at(),damaged=at(),p=trackAt(.1);damaged.health=1;
  for(const car of [healthy,damaged]){car.vx=Math.cos(p.angle)*20+p.nx*4;car.vz=Math.sin(p.angle)*20+p.nz*4;stepCar(car,NEUTRAL);}
  const lateral=car=>-car.vx*Math.sin(car.angle)+car.vz*Math.cos(car.angle);
  assert.ok(lateral(damaged)>lateral(healthy));
});
