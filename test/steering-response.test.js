import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,spawnCar,stepCar,trackAt,NEUTRAL,STEP,angleDelta} from '../shared/game.js';
import {predictFleet} from '../shared/prediction.js';
const drive=steer=>({...NEUTRAL,throttle:1,steer});
function moving(id){selectTrack(id);const f=id==='ice'?.12:.01,p=trackAt(f);return {...spawnCar(),id:'driver',x:p.x,z:p.z,y:p.y,groundY:p.y,angle:p.angle,trackFraction:f,vx:Math.cos(p.angle)*20,vz:Math.sin(p.angle)*20};}

test('dry steering builds smoothly, continues briefly on release, then settles',()=>{
  for(const id of ['coast','desert']){
    const car=moving(id),initial=car.angle;stepCar(car,drive(.4));
    assert.ok(angleDelta(car.angle,initial)>0&&angleDelta(car.angle,initial)<.4*2.05*STEP*.3);
    for(let i=1;i<18;i++)stepCar(car,drive(.4));
    assert.ok(car.steering>.36&&car.steering<.4);
    const held=car.steering,angle=car.angle;stepCar(car,drive(0));
    assert.ok(car.steering>held*.8&&car.steering<held);assert.ok(angleDelta(car.angle,angle)>0);
    for(let i=1;i<36;i++)stepCar(car,drive(0));
    assert.ok(car.steering<held*.03);assert.equal(car.falling,false);
  }
});
test('changing steering direction crosses smoothly without overshooting the stick input',()=>{
  for(const id of ['coast','desert']){
    const car=moving(id);car.steering=.5;
    stepCar(car,drive(-.5));assert.ok(car.steering>0&&car.steering<.5);
    for(let i=0;i<18;i++)stepCar(car,drive(-.5));
    assert.ok(car.steering<-.4&&car.steering>-.5);
  }
});
test('normal dry-road drift stays modest and much smaller than Glacier slip',()=>{
  const slips={};for(const id of ['coast','desert','ice']){
    const car=moving(id);for(let i=0;i<24;i++)stepCar(car,drive(.3));
    slips[id]=Math.abs(-car.vx*Math.sin(car.angle)+car.vz*Math.cos(car.angle));assert.equal(car.falling,false);
  }
  for(const id of ['coast','desert']){assert.ok(slips[id]>.15);assert.ok(slips[id]<slips.ice*.5);}
});
test('Glacier follows its exact pre-change steering and velocity trajectory',()=>{
  const car=moving('ice');for(let i=0;i<36;i++)stepCar(car,drive(i<18?.3:0));
  // Recorded before adding the dry-course steering filter / grip adjustments.
  const expected={x:-228.6020951293549,z:-39.31194132801705,vx:25.535624917795577,vz:2.4965679744981526,angle:.1845,y:1};
  for(const [key,value]of Object.entries(expected))assert.ok(Math.abs(car[key]-value)<1e-10,key);
});
test('replicated steering state survives snapshots and predicts the same release and reversal',()=>{
  for(const id of ['coast','desert']){
    const server=moving(id);let client={...server};
    for(let i=0;i<60;i++){
      const input=drive(i<15?.3:i<30?0:i<45?-.3:0);stepCar(server,input);predictFleet(client,[],input,STEP);
      for(const key of ['x','z','vx','vz','angle','steering'])assert.ok(Math.abs(server[key]-client[key])<1e-10,`${id}: ${key}`);
      if(i%3===2)client=JSON.parse(JSON.stringify(server));
    }
  }
});
