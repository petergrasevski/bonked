import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWheelHeatMaterial,createWheelHeatFlames,updateWheelHeatFlames} from '../public/wheel-heat.js';
import {heatFlameStrength} from '../shared/extra-circuits.js';
test('four wheel flames start above one second, grow with retained heat and disappear on cooldown',()=>{
  const material=createWheelHeatMaterial(),mesh=createWheelHeatFlames(material),matrix=new THREE.Matrix4(),size=new THREE.Vector3();
  assert.equal(mesh.count,8);assert.equal(heatFlameStrength(1),0);
  updateWheelHeatFlames(mesh,{circuitHeat:1},0);assert.equal(mesh.visible,false);
  updateWheelHeatFlames(mesh,{circuitHeat:1.01},1);assert.equal(mesh.visible,true);mesh.getMatrixAt(0,matrix);const small=size.setFromMatrixScale(matrix).y;
  updateWheelHeatFlames(mesh,{circuitHeat:3},2);mesh.getMatrixAt(0,matrix);assert.ok(size.setFromMatrixScale(matrix).y>small*2);
  updateWheelHeatFlames(mesh,{circuitHeat:1.5},3);assert.equal(mesh.visible,true);
  updateWheelHeatFlames(mesh,{circuitHeat:1},4);assert.equal(mesh.visible,false);
  updateWheelHeatFlames(mesh,{circuitHeat:3,eliminated:true},5);assert.equal(mesh.visible,false);
  mesh.geometry.dispose();mesh.dispose();material.dispose();
});
test('wheel flame updates reuse fixed render resources and use the vehicle wheel positions',()=>{
  const material=createWheelHeatMaterial(),mesh=createWheelHeatFlames(material),geometry=mesh.geometry,transform=mesh.userData.transform,matrix=new THREE.Matrix4();
  for(let i=0;i<120;i++)updateWheelHeatFlames(mesh,{circuitHeat:1+i/60},i/60);
  assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);assert.equal(mesh.userData.transform,transform);
  mesh.getMatrixAt(0,matrix);assert.ok(matrix.elements[12]<0&&matrix.elements[14]<0);mesh.getMatrixAt(6,matrix);assert.ok(matrix.elements[12]>0&&matrix.elements[14]>0);
  mesh.geometry.dispose();mesh.dispose();material.dispose();
});
