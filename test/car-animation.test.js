import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSportsCar,disposeCarInstance} from '../public/car-model.js';
import {updateCarVisuals} from '../public/car-animation.js';
function matrix(car,index){const m=new THREE.Matrix4();car.getObjectByName('rolling-tyres').getMatrixAt(index,m);return m;}
test('front wheels steer, all wheels roll, and instance matrices are independent between cars',()=>{
  const a=createSportsCar('#ff0000'),b=createSportsCar('#00ff00');
  const beforeFront=matrix(a,2),beforeRear=matrix(a,0),peer=matrix(b,2);
  updateCarVisuals(a,{steering:1,angle:0,vx:0,vz:0},.016);
  assert.notDeepEqual(matrix(a,2).elements,beforeFront.elements);assert.deepEqual(matrix(a,0).elements,beforeRear.elements);
  assert.deepEqual(matrix(b,2).elements,peer.elements);
  const frontDirection=new THREE.Vector3(1,0,0).transformDirection(matrix(a,2));assert.ok(frontDirection.z>.4);
  updateCarVisuals(a,{steering:0,angle:0,vx:15,vz:0},.03);
  assert.notDeepEqual(matrix(a,0).elements,beforeRear.elements);
  const spin=a.userData.wheelSpin;updateCarVisuals(a,{steering:0,angle:0,vx:-15,vz:0},.03);assert.ok(Math.abs(a.userData.wheelSpin)<Math.abs(spin));
  disposeCarInstance(a);disposeCarInstance(b);
});
test('braking and reversing light only that car rear lamps, including reverse coast',()=>{
  const a=createSportsCar('#ff0000'),b=createSportsCar('#00ff00');
  for(const pose of [{input:{brake:true}},{input:{reverse:true}},{angle:0,vx:-3}]){updateCarVisuals(a,pose,.016);assert.equal(a.userData.braking,true);assert.ok(a.userData.rearLights.emissiveIntensity>4);}
  assert.ok(b.userData.rearLights.emissiveIntensity<1);
  updateCarVisuals(a,{input:{throttle:1},vx:15},.016);assert.equal(a.userData.braking,false);
  updateCarVisuals(a,{input:{reverse:true},wrecked:true},.016);assert.equal(a.userData.braking,false);
  disposeCarInstance(a);disposeCarInstance(b);
});
test('ice headlights illuminate ahead without extra shadow maps and turn off on wrecks',()=>{
  const coast=createSportsCar('#fff'),ice=createSportsCar('#fff',{headlights:true});
  assert.equal(coast.userData.headlight,undefined);assert.ok(ice.userData.headlight.isSpotLight);assert.equal(ice.userData.headlight.castShadow,false);
  assert.ok(ice.userData.headlight.target.position.x>ice.userData.headlight.position.x);
  assert.ok(ice.userData.headlight.target.position.y<ice.userData.headlight.position.y);
  updateCarVisuals(ice,{},.016);assert.ok(ice.userData.headlight.intensity>0);assert.ok(ice.userData.headlamps.emissiveIntensity>4);
  updateCarVisuals(ice,{wrecked:true},.016);assert.equal(ice.userData.headlight.intensity,0);
  let disposed=0;ice.traverse(o=>{if(o.isInstancedMesh)o.addEventListener('dispose',()=>disposed++);});disposeCarInstance(ice);assert.equal(disposed,2);disposeCarInstance(coast);
});
