import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnCar,NEUTRAL,STEP,TOP_SPEED,CAR_LENGTH,damageCar,damageLevel,stepCar,launchCar,carContact,collideCars,trackAt,constrainRoad,TRACK_LENGTH,TRACK,SEGMENTS} from '../shared/game.js';
import {initCombat,giveWeapon,pressWeapon,updateCombat,WEAPON_IDS,DAMAGE} from '../shared/combat.js';
function player(id,x=0,z=0){return {id,car:{...spawnCar(),x,z,angle:0,progress:x/TRACK_LENGTH},input:{...NEUTRAL},fireLatch:false};}
function room(...ps){const r={phase:'racing',startAt:0,players:new Map(ps.map(p=>[p.id,p]))};initCombat(r);return r;}
function fire(r,p,id,now=0){giveWeapon(p.car,id);assert.ok(pressWeapon(r,p,now));}
function run(r,seconds,start=0){for(let i=1;i<=Math.ceil(seconds/STEP);i++)updateCombat(r,STEP,start+i*STEP*1000);}
test('shorter technical circuit has no crossings or overlapping distant road sections',()=>{
  assert.ok(Math.abs(TRACK_LENGTH-3466.9092022732743*.7)<1e-7);assert.equal(TOP_SPEED,36);assert.equal(WEAPON_IDS.length,11);
  // Samples separated by at least 35m of road must leave space for two 12m roads.
  for(let i=0;i<SEGMENTS.length;i+=4)for(let j=i+4;j<SEGMENTS.length;j+=4){const d=Math.abs(SEGMENTS[j].start-SEGMENTS[i].start);if(Math.min(d,TRACK_LENGTH-d)>35)assert.ok(Math.hypot(TRACK[i].x-TRACK[j].x,TRACK[i].z-TRACK[j].z)>14,`road overlap ${i}, ${j}`);}
});
test('pulse hits twice exactly one second apart and preserves a sideways skid',()=>{
  const a=player('a'),b=player('b',0,8),r=room(a,b);fire(r,a,'pulse');assert.equal(b.car.health,92);assert.ok(b.car.vz>10);assert.equal(a.car.item,null);
  updateCombat(r,STEP,999);assert.equal(b.car.health,92);updateCombat(r,STEP,1000);assert.equal(b.car.health,84);updateCombat(r,STEP,2000);assert.equal(b.car.health,84);
  const p=trackAt(.01);Object.assign(b.car,{x:p.x,z:p.z,angle:p.angle,vx:p.nx*12,vz:p.nz*12});stepCar(b.car,NEUTRAL);assert.ok(Math.abs(-b.car.vx*Math.sin(p.angle)+b.car.vz*Math.cos(p.angle))>11);
});
test('rocket locks onto next race position, turns, and deals high damage',()=>{
  const a=player('a'),b=player('b',24,4),c=player('c',40),behind=player('behind',10);behind.car.progress=-1;const r=room(a,b,c,behind);fire(r,a,'rocket');assert.equal(r.projectiles[0].target,'b');updateCombat(r,STEP,16);assert.ok(r.projectiles[0].angle>0);
  // Remove an intervening vehicle to verify the homing hit rather than interception.
  r.players.delete('behind');run(r,1,16);assert.equal(b.car.health,100-DAMAGE.rocket);
});
test('machine gun fires only while held and consumes exactly 30 rounds',()=>{
  const a=player('a'),r=room(a);giveWeapon(a.car,'machinegun');run(r,.5);assert.equal(a.car.ammo,30);a.input.fire=true;run(r,1);const used=30-a.car.ammo;assert.ok(used>=10&&used<=14);a.input.fire=false;run(r,.5,1000);assert.equal(a.car.ammo,30-used);a.input.fire=true;run(r,4,1500);assert.equal(a.car.ammo,0);assert.equal(a.car.item,null);assert.ok(r.effects.every(e=>e.kind==='tracer'));const finalSerial=r.serial;run(r,1,6000);assert.equal(r.serial,finalSerial,'empty gun cannot fire more rounds');
});
test('fast bullets sweep through targets instead of tunnelling',()=>{
  const a=player('a'),b=player('b',7),r=room(a,b);fire(r,a,'machinegun');updateCombat(r,STEP,17);assert.equal(b.car.health,98);assert.equal(r.projectiles.length,0);
});
test('shield blocks damage and launches for eight seconds',()=>{
  const a=player('a'),r=room(a);fire(r,a,'shield');assert.equal(a.car.shield,8);damageCar(a.car,75);launchCar(a.car,15,1,1);assert.equal(a.car.health,100);assert.equal(a.car.y,0);
  const p=trackAt(.01);Object.assign(a.car,{x:p.x,z:p.z,angle:p.angle});for(let i=0;i<479;i++)stepCar(a.car,NEUTRAL);assert.ok(a.car.shield>0);damageCar(a.car,10);assert.equal(a.car.health,100);stepCar(a.car,NEUTRAL);stepCar(a.car,NEUTRAL);damageCar(a.car,10);assert.equal(a.car.health,90);
});
test('railgun instantly pierces multiple aligned cars and leaves a lingering trail',()=>{
  const a=player('a'),b=player('b',20),c=player('c',40),side=player('side',20,6),r=room(a,b,c,side);fire(r,a,'railgun');assert.equal(b.car.health,25);assert.equal(c.car.health,25);assert.ok(b.car.vy>0&&b.car.vy<15);assert.ok(c.car.vy>0&&c.car.vy<15);assert.equal(side.car.health,100);assert.equal(r.projectiles.length,0);assert.equal(r.effects.find(e=>e.kind==='rail').until,1800);assert.equal(a.car.item,null);
});
test('three separate mine presses, near-immediate arming and ballistic launch',()=>{
  const a=player('a'),b=player('b',-3.5,1),r=room(a,b);giveWeapon(a.car,'mine');assert.ok(pressWeapon(r,a,0));assert.equal(a.car.ammo,2);
  updateCombat(r,STEP,99);assert.equal(b.car.health,100);updateCombat(r,STEP,100);assert.equal(b.car.health,72);assert.ok(b.car.vy>=15);assert.notEqual(b.car.rollVelocity,0);
  r.players.delete('b');run(r,.25,100);assert.ok(pressWeapon(r,a,350));run(r,.25,350);assert.ok(pressWeapon(r,a,600));assert.equal(a.car.item,null);assert.equal(r.mines.length,2);
});
test('mine-like launches can land upright or on a recoverable roof',()=>{
  const land=side=>{const c=spawnCar(),p=trackAt(.01);Object.assign(c,{x:p.x,z:p.z,angle:p.angle});launchCar(c,15,side,0);for(let i=0;i<120;i++)stepCar(c,NEUTRAL);return c;};const upright=land(0),roof=land(.3);assert.equal(upright.overturned,false);assert.equal(roof.overturned,true);assert.equal(roof.health,100);const {x,z}=roof;for(let i=0;i<120;i++)stepCar(roof,{...NEUTRAL,throttle:1,steer:1});assert.equal(roof.overturned,false);assert.ok(Math.hypot(roof.x-x,roof.z-z)>1);
});
test('ball and chain obeys its tether and transfers motion through turns',()=>{
  const a=player('a'),r=room(a);fire(r,a,'chain');const ball=r.chains[0];for(let i=1;i<600;i++){a.car.x+=.3;a.car.z=Math.sin(i*.02)*4;a.car.angle=Math.atan2(Math.cos(i*.02)*.08,.3);a.car.vx=18;a.car.vz=Math.cos(i*.02)*4.8;updateCombat(r,STEP,i*STEP*1000);assert.ok(Math.hypot(ball.x-ball.anchorX,ball.z-ball.anchorZ)<=ball.length+.001);assert.ok(Number.isFinite(ball.vx)&&Math.abs(ball.vx)<100);}assert.ok(Math.abs(ball.vz)>1);
  const b=player('b',ball.x+.5,ball.z);b.car.y=ball.y-.75;r.players.set('b',b);updateCombat(r,STEP,10000);assert.equal(b.car.health,55);assert.ok(b.car.vy>0&&b.car.vy<15);assert.equal(r.chains.length,0);
});
test('flamethrower has three seconds of held fuel, limited forward reach and continuous damage',()=>{
  const a=player('a'),b=player('b',7),c=player('c',18),behind=player('behind',-4),r=room(a,b,c,behind);giveWeapon(a.car,'flame');run(r,1);assert.equal(a.car.ammo,3);a.input.fire=true;run(r,2,1000);assert.ok(Math.abs(b.car.health-76)<1e-6);a.input.fire=false;run(r,1,3000);assert.ok(Math.abs(a.car.ammo-1)<1e-6);assert.equal(a.car.firing,null);a.input.fire=true;run(r,4,4000);assert.equal(a.car.item,null);assert.ok(Math.abs(b.car.health-64)<1e-6);assert.equal(c.car.health,100);assert.equal(behind.car.health,100);
});
test('plasma travels straight at 1.5 times top speed with minor damage',()=>{
  const a=player('a'),b=player('b',30),r=room(a,b);fire(r,a,'plasma');const shot=r.projectiles[0],x=shot.x;updateCombat(r,STEP,17);assert.equal(shot.speed,54);assert.equal(shot.angle,0);assert.ok(Math.abs(shot.x-x-54*STEP)<1e-6);run(r,.6,17);assert.equal(b.car.health,92);
});
test('shotgun fires sideways from both doors, knocks cars outwards, ignores front and rear',()=>{
  const a=player('a'),left=player('left',0,-6),right=player('right',0,6),front=player('front',8),back=player('back',-8),r=room(a,left,right,front,back);fire(r,a,'shotgun');assert.equal(left.car.health,64);assert.equal(right.car.health,64);assert.ok(left.car.vz<0&&right.car.vz>0);assert.equal(front.car.health,100);assert.equal(back.car.health,100);
});
test('wall impacts damage chassis; zero health launches a persistent solid wreck',()=>{
  const c=spawnCar(),p=trackAt(.01);Object.assign(c,{x:p.x+p.nx*p.halfWidth,z:p.z+p.nz*p.halfWidth,angle:p.angle,vx:p.nx*20,vz:p.nz*20});constrainRoad(c);assert.ok(c.health<100&&c.health>94);assert.deepEqual([100,80,60.01,60,45,30,15,0].map(damageLevel),[0,0,0,1,2,3,4,4]);damageCar(c,100);assert.ok(c.wrecked&&c.eliminated&&c.vy>0&&c.rollVelocity>0);assert.equal(c.health,0);
  Object.assign(c,{x:0,z:0,angle:0,y:0,vx:0,vz:0,yawVelocity:0});const b=player('b',-4).car;b.vx=20;collideCars([b,c]);assert.ok(b.vx<20);assert.ok(c.vx>0);assert.equal(carContact(b,c),null);assert.ok(c.wrecked);
});

test('shotgun can fire again after 0.3 seconds, but not sooner',()=>{const a=player('a'),r=room(a);fire(r,a,'shotgun');run(r,.2);assert.equal(pressWeapon(r,a,200),false);run(r,.12,200);assert.equal(pressWeapon(r,a,320),true);assert.equal(a.car.ammo,2);});

test('all three shotgun barrels deal independent damage with matching visible shots',()=>{
  const losses=[];
  for(const x of [3.7,2.45,0]){
    const a=player('a'),b=player('b',x,12),r=room(a,b);fire(r,a,'shotgun');losses.push(100-b.car.health);
    const shots=r.effects.filter(e=>e.kind==='shotgun');assert.equal(shots.length,6);assert.equal(new Set(shots.map(e=>`${e.x}:${e.z}`)).size,6);
  }
  assert.deepEqual(losses,[12,24,36]);
});
test('flame reaches 1.5 times its former range but still respects the far limit',()=>{
  const a=player('a'),near=player('near',15),far=player('far',17),r=room(a,near,far);giveWeapon(a.car,'flame');a.input.fire=true;run(r,1);assert.ok(Math.abs(near.car.health-88)<1e-6);assert.equal(far.car.health,100);
});
