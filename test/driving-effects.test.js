import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,spawnCar,trackAt,hasBarrier,constrainRoad,stepCar,collideCars,NEUTRAL,CAR_WIDTH,TOP_SPEED} from '../shared/game.js';
import {PAD_DURATION} from '../shared/boost-pads.js';
import {recordScrape} from '../shared/contact-feedback.js';
import {burnoutActive,drivingEmitters} from '../public/driving-effects.js';
const at=(fraction=.01)=>{const p=trackAt(fraction);return {...spawnCar(),x:p.x,z:p.z,y:p.y,groundY:p.y,trackFraction:fraction,angle:p.angle,pitch:Math.atan(p.grade||0)};};
test('pad thrust accounts for sideways momentum instead of adding a full speed again',()=>{
  selectTrack('coast');const car=at(),c=Math.cos(car.angle),s=Math.sin(car.angle);
  Object.assign(car,{vx:c*20-s*40,vz:s*20+c*40,padBoostRemaining:PAD_DURATION-.4,padBoostFrom:20,impactTime:.2});
  stepCar(car,NEUTRAL);assert.ok(Math.hypot(car.vx,car.vz)<=TOP_SPEED*1.5+1e-8);
});
test('boost-fed barrier impacts stop injecting thrust and stay bounded at oblique angles',()=>{
  for(const track of ['coast','ice','desert']){selectTrack(track);let fraction;
    for(let f=.01;f<1;f+=.005)if(hasBarrier(f,1)){fraction=f;break;}
    for(const angle of [.25,.6,1.1]){const car=at(fraction),road=trackAt(fraction);car.angle+=angle;Object.assign(car,{vx:Math.cos(car.angle)*54,vz:Math.sin(car.angle)*54,padBoostRemaining:2,padBoostFrom:20,shield:1000});
      car.x+=road.nx*(road.halfWidth-.5);car.z+=road.nz*(road.halfWidth-.5);constrainRoad(car);
      assert.equal(car.padBoostRemaining,0,`${track}: impact cancels pad`);assert.ok(car.scrape?.remaining>0);
      for(let i=0;i<120;i++){const x=car.x,z=car.z;stepCar(car,{...NEUTRAL,throttle:1});assert.ok(Math.hypot(car.vx,car.vz)<55,`${track}: no runaway speed`);assert.ok(Math.hypot(car.x-x,car.z-z)<1.5,`${track}: no map jump`);}
    }
  }
});
test('door contacts retain the actual contact location on both cars and cancel boosts',()=>{
  selectTrack('coast');const a={...spawnCar(),x:0,z:0,angle:0,vx:20,vz:6,padBoostRemaining:2},b={...spawnCar(),x:1,z:CAR_WIDTH-.1,angle:0,vx:10};collideCars([a,b]);
  assert.equal(a.padBoostRemaining,0);assert.ok(a.scrape&&b.scrape);
  const [spark]=drivingEmitters(a,'racing');assert.equal(spark.kind,'spark');assert.ok(Math.abs(spark.z-a.z-CAR_WIDTH/2)<.1);assert.ok(Math.abs(spark.x-.5)<.1);
  assert.equal(drivingEmitters(a,'countdown').length,0);
});
test('burnouts emit at the rear tyre contact patches only while countdown throttle is held',()=>{
  const car={...spawnCar(),x:10,y:3,z:20,angle:Math.PI/2,pitch:0,roll:0,input:{...NEUTRAL,throttle:1}};
  assert.equal(burnoutActive(car,'countdown'),true);const smoke=drivingEmitters(car,'countdown');assert.equal(smoke.length,2);
  assert.ok(smoke.every(p=>p.kind==='burnout'&&Math.abs(p.z-18.52)<1e-8&&p.y===3.12));assert.ok(Math.abs(smoke[0].x-smoke[1].x-1.82)<1e-8);
  for(const change of [{input:NEUTRAL},{input:{throttle:1,reverse:true}},{wrecked:true},{eliminated:true},{falling:true}])assert.equal(drivingEmitters({...car,...change},'countdown').length,0);
  assert.equal(drivingEmitters(car,'racing').length,0);assert.equal(drivingEmitters(car,'lobby').length,0);
});
test('stationary contact emits nothing and transient scrape feedback expires',()=>{
  selectTrack('coast');const car=at();recordScrape(car,0,1);assert.equal(car.scrape,undefined);car.vx=10;recordScrape(car,0,1);assert.ok(car.scrape);
  for(let i=0;i<10;i++)stepCar(car,NEUTRAL);assert.equal(car.scrape,null);
});
