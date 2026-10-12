import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {TRACK_LENGTH, START_FRACTION, trackAt, angleDelta, CAR_LENGTH, CAR_WIDTH} from '../shared/game.js';
import {createChase, cameraFrame, CAMERA_LOOKAHEAD, CAMERA_REAR_SPACE, CHASE_DISTANCE} from '../shared/chase.js';
import {CAMERA_FOV, stepCamera, cameraPose} from '../shared/camera.js';

const carAt=(metres,offset=0,height=0)=>{
  const p=trackAt(START_FRACTION+metres/TRACK_LENGTH);
  return {...p,x:p.x+p.nx*offset,z:p.z+p.nz*offset,progress:metres/TRACK_LENGTH,y:height};
};
function projection(frame,aspect){
  const camera=new THREE.PerspectiveCamera(CAMERA_FOV,aspect,.2,frame.far),pose=cameraPose(frame);
  camera.position.set(pose.x,pose.y,pose.z);camera.lookAt(pose.targetX,pose.targetY,pose.targetZ);camera.updateMatrixWorld();return camera;
}
function contained(camera,car){
  const c=Math.cos(car.angle),s=Math.sin(car.angle);
  for(const x of [-CAR_LENGTH/2,CAR_LENGTH/2])for(const z of [-CAR_WIDTH/2,CAR_WIDTH/2])for(const y of [0,3.5]){
    const p=new THREE.Vector3(car.x+x*c-z*s,car.y+y,car.z+x*s+z*c).project(camera);
    assert.ok(Math.abs(p.x)<.85&&p.y>-.61&&p.y<.77&&p.z>-1&&p.z<1,`car clipped: ${p.toArray()}`);
  }
}
test('compact packs use a rear chase view; spread gradually raises the camera',()=>{
  let previous=0;
  for(let spread=0;spread<=100;spread++){
    const cars=[carAt(100),carAt(100-spread)],f=cameraFrame(createChase(cars),cars);
    assert.ok(f.pitch>=previous);previous=f.pitch;
    assert.ok(Math.abs(f.from-(100-spread-CAMERA_REAR_SPACE)/TRACK_LENGTH)<1e-9);
    assert.ok(Math.abs(f.to-(100+CAMERA_LOOKAHEAD)/TRACK_LENGTH)<1e-9);
    if(spread<=18)assert.equal(f.pitch,26*Math.PI/180);
    if(spread>=88)assert.equal(f.pitch,70*Math.PI/180);
  }
  const cars=[carAt(100)],chase=createChase(cars),f=cameraFrame(chase,cars);
  assert.ok(f.from>chase.progress,'a distant death line must not force a wide view');
  const frame=stepCamera(null,f,cars,2,1/60),pose=cameraPose(frame);
  assert.ok((pose.x-f.x)*Math.cos(f.angle)+(pose.z-f.z)*Math.sin(f.angle)<0);
});
test('every car, roof weapon and rear warning strip fit through turns, spread and lap seams',()=>{
  for(const aspect of [1.3,16/9,844/390,3])for(const spread of [0,11,45,100]){
    let previous=null;
    for(let metres=-20;metres<TRACK_LENGTH+80;metres+=9){
      const cars=Array.from({length:8},(_,i)=>carAt(metres-spread*i/7,i%2?3:-3,i===3?4:0));
      const target=cameraFrame(createChase(cars),cars),frame=stepCamera(previous,target,cars,aspect,.05),camera=projection(frame,aspect);
      cars.forEach(car=>contained(camera,car));
      for(const at of [target.from,target.to]){const p=trackAt(START_FRACTION+at);const v=new THREE.Vector3(p.x,0,p.z).project(camera);assert.ok(Math.abs(v.x)<1&&Math.abs(v.y)<1);}
      previous=frame;
    }
  }
});
test('camera containment survives sudden impacts, viewport changes and elimination',()=>{
  const cars=[carAt(200,-4),carAt(190,4)],target=cameraFrame(createChase(cars),cars);
  let frame=stepCamera(null,target,cars,2.4,1/60);
  cars[1].x+=35;cars[1].z-=20;cars[1].y=12;
  frame=stepCamera(frame,target,cars,1.3,1/60);cars.forEach(car=>contained(projection(frame,1.3),car));
  const distant={...carAt(-100),eliminated:true};assert.deepEqual(cameraFrame(createChase(cars),[...cars,distant]),cameraFrame(createChase(cars),cars));
  const next=cameraFrame(createChase([cars[0]]),[cars[0]]),settling=stepCamera(frame,next,[cars[0]],1.3,1/60);
  assert.ok(settling.distance>frame.distance*.95,'elimination must not snap the camera inward');
});
test('heading anticipates curves, stays independent of car heading and turns smoothly',()=>{
  let anticipation=0;
  for(let metres=0;metres<TRACK_LENGTH;metres+=10){
    const car=carAt(metres),f=cameraFrame(createChase([car]),[car]);
    anticipation=Math.max(anticipation,Math.abs(angleDelta(f.angle,car.angle)));
    assert.deepEqual(cameraFrame(createChase([car]),[{...car,angle:car.angle+Math.PI}]),f);
    const next={...f,angle:f.angle+Math.PI/2,pitch:70*Math.PI/180};
    const a=stepCamera(null,f,[car],2,1/60),b=stepCamera(a,next,[car],2,1/60);
    assert.ok(Math.abs(b.angle-a.angle)<.08);assert.ok(b.pitch-a.pitch<.025);
  }
  assert.ok(anticipation>.2,'camera should turn before the car reaches the bend');
  const cars=[carAt(200),carAt(200-CHASE_DISTANCE+5)],f=cameraFrame(createChase(cars),cars);
  assert.ok(f.from<createChase(cars).progress,'a death line five metres behind the tail is inside the rear strip');
});


test('drifting body rotation cannot pump camera zoom while position stays fixed',()=>{
  const car=carAt(220,7,2),target=cameraFrame(createChase([car]),[car]);
  for(const aspect of [1.3,852/393,3]){
    const base=stepCamera(null,target,[car],aspect,1/60);
    for(let angle=-Math.PI;angle<Math.PI;angle+=.07){
      const drifting={...car,angle},frame=stepCamera(null,target,[drifting],aspect,1/60);
      assert.ok(Math.abs(frame.distance-base.distance)<1e-10,'yaw alone must not change framing');
      contained(projection(frame,aspect),drifting);
    }
  }
});
