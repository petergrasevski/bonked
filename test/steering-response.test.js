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
test('Glacier carries more momentum through tight fast turns, then recovers on release',()=>{
  const probe=steer=>{
    const car=moving('ice'),p=trackAt(.12);car.vx=Math.cos(car.angle)*36;car.vz=Math.sin(car.angle)*36;
    for(let i=0;i<30;i++){car.x=p.x;car.z=p.z;const speed=Math.hypot(car.vx,car.vz);car.vx*=36/speed;car.vz*=36/speed;stepCar(car,drive(steer));}
    return {car,p,slip:Math.abs(angleDelta(car.angle,Math.atan2(car.vz,car.vx)))};
  };
  const gentle=probe(.2),tight=probe(.65);
  assert.ok(tight.slip>27.91*Math.PI/180*1.1,'more tail-out momentum than the previous ice tuning');
  assert.ok(tight.slip<Math.PI/4,'a sustained turn remains controllable');
  assert.ok(tight.slip>gentle.slip*3,'tight U-turns carry more slip than gentle adjustments');
  const before=tight.car.angle;stepCar(tight.car,drive(0));
  assert.equal(tight.car.steering,0);assert.equal(tight.car.angle,before,'release does not add an artificial spin');
  assert.ok(Math.abs(angleDelta(tight.car.angle,Math.atan2(tight.car.vz,tight.car.vx)))>tight.slip*.9,'momentum does not snap straight on release');
  for(let i=0;i<150;i++){tight.car.x=tight.p.x;tight.car.z=tight.p.z;stepCar(tight.car,drive(0));}
  assert.ok(Math.abs(angleDelta(tight.car.angle,Math.atan2(tight.car.vz,tight.car.vx)))<tight.slip*.1,'slide settles as grip returns');
});
test('replicated steering state survives snapshots and predicts the same release and reversal',()=>{
  for(const id of ['coast','desert','ice'])for(const speed of [20,36]){
    const server=moving(id);server.vx=Math.cos(server.angle)*speed;server.vz=Math.sin(server.angle)*speed;let client={...server};
    for(let i=0;i<60;i++){
      const input=drive(i<15?.3:i<30?0:i<45?-.3:0);stepCar(server,input);predictFleet(client,[],input,STEP);
      for(const key of ['x','z','vx','vz','angle','steering'])assert.ok(Math.abs(server[key]-client[key])<1e-10,`${id}: ${key}`);
      if(i%3===2)client=JSON.parse(JSON.stringify(server));
    }
  }
});

test('dry-track slip builds progressively with cornering speed and recovers after steering release',()=>{
  for(const id of ['coast','desert']){
    const slipAt=speed=>{const car=moving(id),p=trackAt(.01);car.vx=Math.cos(car.angle)*speed;car.vz=Math.sin(car.angle)*speed;
      // Keep the probe away from walls and at a fixed speed, so only grip is measured.
      for(let i=0;i<30;i++){car.x=p.x;car.z=p.z;const v=Math.hypot(car.vx,car.vz);car.vx*=speed/v;car.vz*=speed/v;stepCar(car,drive(.65));}
      return {car,p,slip:Math.abs(angleDelta(car.angle,Math.atan2(car.vz,car.vx)))};
    };
    const low=slipAt(12),mid=slipAt(24),fast=slipAt(36);assert.ok(mid.slip>low.slip);assert.ok(fast.slip>low.slip*1.8);assert.ok(fast.slip>Math.PI/15,'fast turns visibly swing the rear out by more than 12 degrees');assert.ok(fast.slip<Math.PI/9,'fast cornering stays below 20 degrees of slip');
    for(let i=0;i<90;i++){fast.car.x=fast.p.x;fast.car.z=fast.p.z;stepCar(fast.car,drive(0));}
    assert.ok(Math.abs(angleDelta(fast.car.angle,Math.atan2(fast.car.vz,fast.car.vx)))<fast.slip*.03,'grip settles naturally after release');
  }
});
