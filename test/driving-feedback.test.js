import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnCar,STEP,NEUTRAL,stepCar,healthSpeedFactor,TOP_SPEED,launchResult,applyLaunch,recordLaunchInput,trackAt,constrainRoad,SURFACE_HALF_WIDTH,hasBarrier,carContact,collideCars,CAR_LENGTH,CAR_WIDTH} from '../shared/game.js';
import {predictFleet} from '../shared/prediction.js';
const gas={...NEUTRAL,throttle:1};
const at=(fraction=.01,side=0)=>{const c=spawnCar(),p=trackAt(fraction);return Object.assign(c,{x:p.x+p.nx*side,z:p.z+p.nz*side,angle:p.angle});};
test('launch window is inclusive at ±20ms; >2s early spins; other starts are normal',()=>{
  for(const lead of [980,1000,1020])assert.equal(launchResult(10000-lead,10000),'boost');
  for(const lead of [0,979,1021,1500,2000])assert.equal(launchResult(10000-lead,10000),'normal');
  for(const lead of [2001,3000])assert.equal(launchResult(10000-lead,10000),'spinout');
  assert.equal(launchResult(null,10000),'normal');
});
test('countdown records one hold edge, resets on release and bounds network timestamps',()=>{
  const p={input:{...NEUTRAL},lastInput:0};recordLaunchInput(p,gas,8990,9040,10000);assert.equal(p.accelPressedAt,8990);p.input=gas;p.lastInput=9040;
  recordLaunchInput(p,gas,9050,9050,10000);assert.equal(p.accelPressedAt,8990);
  recordLaunchInput(p,NEUTRAL,9100,9100,10000);assert.equal(p.accelPressedAt,null);p.input=NEUTRAL;p.lastInput=9100;
  recordLaunchInput(p,gas,5000,9200,10000);assert.equal(p.accelPressedAt,9200);
  recordLaunchInput(p,gas,99999,9200,10000);assert.equal(p.accelPressedAt,9200);
});
test('launch boost accelerates faster, and spinout completes before held gas resumes',()=>{
  const normal=at(),boost=at(),spin=at();applyLaunch(normal,8500,10000);applyLaunch(boost,9000,10000);applyLaunch(spin,7000,10000);const angle=spin.angle;
  for(let i=0;i<30;i++){stepCar(normal,gas);stepCar(boost,gas);stepCar(spin,gas);}
  assert.ok(Math.hypot(boost.vx,boost.vz)>Math.hypot(normal.vx,normal.vz)*1.2);assert.equal(Math.hypot(spin.vx,spin.vz),0);assert.notEqual(spin.angle,angle);
  for(let i=0;i<50;i++)stepCar(spin,gas);assert.ok(Math.hypot(spin.vx,spin.vz)>3);assert.ok(Math.abs((spin.angle-angle)-Math.PI*2)<1e-8);
});
test('engine speed scales linearly from 100% at 100HP to 60% at 1HP',()=>{
  assert.equal(healthSpeedFactor(100),1);assert.equal(healthSpeedFactor(1),.6);assert.equal(healthSpeedFactor(50.5),.8);
  for(const health of [1,25,50,75,100]){const c=at();c.health=health;const p=trackAt(.01);for(let i=0;i<300;i++){c.x=p.x;c.z=p.z;c.angle=p.angle;stepCar(c,gas);}assert.ok(Math.abs(Math.hypot(c.vx,c.vz)-TOP_SPEED*healthSpeedFactor(health))<.01);}
});
test('every exposed edge drops into water on both sides; shielding cannot save a fall',()=>{
  for(const fraction of [.14,.35,.60,.81]){assert.equal(hasBarrier(fraction),false);for(const side of [-1,1]){
    const c=at(fraction,side*(trackAt(fraction).halfWidth+1.6));c.shield=8;constrainRoad(c);assert.equal(c.falling,true);
    for(let i=0;i<90;i++)stepCar(c,NEUTRAL);assert.ok(c.wrecked&&c.eliminated);assert.equal(c.health,0);assert.ok(c.y< -2.1);
  }}
});
test('closed barriers stop grounded cars, but airborne cars cannot land in invisible fields',()=>{
  const grounded=at(.01,6),air=at(.01,10);constrainRoad(grounded);assert.equal(grounded.falling,false);air.y=2;air.vy=-2;constrainRoad(air);for(let i=0;i<90;i++)stepCar(air,NEUTRAL);assert.ok(air.eliminated&&air.falling);
});
test('parallel bumper contacts transfer momentum without spurious corner spin',()=>{
  const a={...spawnCar(),x:0,z:0,angle:0,vx:25},b={...spawnCar(),x:CAR_LENGTH-.1,z:0,angle:1e-9,vx:10};collideCars([a,b]);assert.equal(carContact(a,b),null);assert.ok(b.vx>16&&a.vx<19);assert.ok(Math.abs(a.yawVelocity)<.0001&&Math.abs(b.yawVelocity)<.0001);
});
test('door contacts push cars sideways and glancing rear-quarter hits produce rotation',()=>{
  const a={...spawnCar(),x:0,z:0,angle:0,vz:12},b={...spawnCar(),x:0,z:CAR_WIDTH-.1,angle:0};collideCars([a,b]);assert.ok(b.vz>5);assert.equal(carContact(a,b),null);
  const c={...spawnCar(),x:0,z:0,angle:0,vx:20},d={...spawnCar(),x:CAR_LENGTH-.1,z:1.2,angle:0};collideCars([c,d]);assert.ok(Math.abs(d.yawVelocity)>.2);assert.equal(carContact(c,d),null);
});
test('local prediction resolves peer contact before the next network snapshot',()=>{
  const a=at(),b=at(),p=trackAt(.01);a.vx=Math.cos(p.angle)*20;a.vz=Math.sin(p.angle)*20;b.x+=Math.cos(p.angle)*(CAR_LENGTH+.1);b.z+=Math.sin(p.angle)*(CAR_LENGTH+.1);
  for(let i=0;i<5;i++)predictFleet(a,[b],gas,STEP);assert.ok(Math.hypot(b.vx,b.vz)>5);assert.ok(!carContact(a,b)||carContact(a,b).depth<.01);assert.ok(a.x<b.x);
});
