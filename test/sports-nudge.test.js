import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSportsCar} from '../public/car-model.js';
import {spawnCar,resolveNudges,CAR_LENGTH,CAR_WIDTH} from '../shared/game.js';
const hit=(offset=0,direction=1)=>{
  const a={...spawnCar(0),x:offset,z:-1.95*direction,y:0,groundY:0,angle:0,nudgeMoved:true,nudgeAngle:0,nudgeDirection:direction};
  const b={...spawnCar(1),x:0,z:0,y:0,groundY:0,angle:0};
  resolveNudges([a,b]);return [a,b];
};
test('shove momentum gives half recoil to the initiator, with opposite yaw for front and rear contacts',()=>{
  for(const direction of [-1,1])for(const offset of [-2,0,2]){
    const [a,b]=hit(offset,direction);
    assert.ok(b.vz*direction>7);assert.ok(Math.abs(a.vz+b.vz*.5)<1e-9);
    assert.equal(a.vx+b.vx,0);assert.equal(Math.sign(b.yawVelocity),Math.sign(offset*direction)||0);
    assert.equal(a.yawVelocity,b.yawVelocity*.5);assert.ok(a.impactTime<=.11);assert.ok(b.impactTime>=.6);assert.equal(b.health,92);
    const velocity=b.vz,yaw=b.yawVelocity;
    resolveNudges([a,b]);assert.equal(b.health,92);assert.equal(b.vz,velocity);assert.equal(b.yawVelocity,yaw);
  }
});
test('shove contact respects the target relative velocity instead of overwriting it',()=>{
  const [a,b]=hit();a.nudgeHits=[];a.vz=0;b.vz=30;b.yawVelocity=0;
  resolveNudges([a,b],{damage:false});assert.equal(b.vz,30);assert.equal(a.vz,0);
});
test('sports body keeps collision dimensions, wheel ground contact and roof weapon clearance',()=>{
  const car=createSportsCar('#ef384d'),bounds=new THREE.Box3().setFromObject(car),size=bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-CAR_LENGTH)<1e-6);assert.ok(Math.abs(size.z-CAR_WIDTH)<1e-6);
  assert.equal(bounds.min.y,0);assert.ok(bounds.max.y<1.05);
  assert.ok(car.children.length<=7);
  for(const mesh of car.children)for(const attribute of Object.values(mesh.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
  car.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,3,0),new THREE.Vector3(0,-1,0)),roof=ray.intersectObject(car)[0];
  assert.ok(roof.point.y>.95,'roof visible from above with outward normals');assert.ok(roof.face.normal.y>.8);
});
test('cars share geometry but keep their paint and damage tint independent',()=>{
  const a=createSportsCar('#ff0000'),b=createSportsCar('#0000ff');
  assert.notEqual(a.userData.paint,b.userData.paint);assert.equal(a.children[0].geometry,b.children[0].geometry);
  a.userData.paint.color.set('#000000');assert.equal(b.userData.paint.color.getHex(),0x0000ff);
  assert.equal(a.userData.paint.clearcoat,1);assert.ok(a.userData.paint.roughness<.25);
});
