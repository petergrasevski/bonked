import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,MOLES} from '../shared/game.js';
import {moleState} from '../shared/desert-features.js';
import {createMoleParts,buildDesertMoles,updateDesertMoles} from '../public/desert-moles.js';
function fixture(){
  const scene=new THREE.Scene(),staticGroup=new THREE.Group(),materials=new Map();scene.add(staticGroup);
  return {scene,static:staticGroup,mesh(geometry,color,x,y,z){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color}));const mesh=new THREE.Mesh(geometry,materials.get(color));mesh.position.set(x,y,z);staticGroup.add(mesh);return mesh;}};
}
function stateTime(mole,predicate){for(let t=0;t<20;t+=.025)if(predicate(moleState(mole,t)))return t;throw Error('required mole state missing');}

test('mole model has bounded height and footprint with five shared material groups',()=>{
  const parts=createMoleParts();assert.equal(parts.length,5);let triangles=0,top=0,radius=0;
  for(const {geometry}of parts){const p=geometry.attributes.position;triangles+=p.count/3;for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));top=Math.max(top,p.getY(i));radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));}}
  assert.ok(top>2.3&&top<=2.5);assert.ok(radius<1.7);assert.ok(triangles<1800,`triangles per mole: ${triangles}`);
});

test('mole field reuses six instanced draws and flat static holes',()=>{
  selectTrack('desert');const w=fixture(),group=buildDesertMoles(w);
  assert.equal(group.children.length,6);assert.equal(w.static.children.length,MOLES.length*2);
  for(const child of group.children){assert.ok(child.isInstancedMesh);assert.ok(child.frustumCulled);assert.ok(child.boundingSphere.radius>0);}
  const parts=group.userData.parts,geometries=parts.map(p=>p.geometry),arrays=parts.map(p=>p.instanceMatrix.array);
  for(const t of [0,.35,2.5,8,1000]){updateDesertMoles(group,t);for(const [i,part]of parts.entries()){assert.equal(part.geometry,geometries[i]);assert.equal(part.instanceMatrix.array,arrays[i]);assert.ok(part.instanceMatrix.array.every(Number.isFinite));}}
  for(const mesh of w.static.children){for(const y of Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.geometry.attributes.position.getY(i)))assert.ok(Math.abs(y)<1e-6,'holes and soil rings must be flat');}
});

test('inactive moles disappear completely and warning dirt appears before emergence',()=>{
  selectTrack('desert');const group=buildDesertMoles(fixture()),mole=group.userData.descriptors[0],matrix=new THREE.Matrix4();
  const hidden=stateTime(mole,s=>s.rise===0&&!s.warning);updateDesertMoles(group,hidden);
  group.userData.parts[0].getMatrixAt(0,matrix);assert.equal(matrix.getMaxScaleOnAxis(),0);group.userData.dirt.getMatrixAt(0,matrix);assert.equal(matrix.getMaxScaleOnAxis(),0);
  const warning=stateTime(mole,s=>s.warning&&s.rise===0);updateDesertMoles(group,warning);
  group.userData.parts[0].getMatrixAt(0,matrix);assert.equal(matrix.getMaxScaleOnAxis(),0);group.userData.dirt.getMatrixAt(0,matrix);assert.ok(matrix.getMaxScaleOnAxis()>0);
  const full=stateTime(mole,s=>s.rise===1);updateDesertMoles(group,full);
  group.userData.parts[0].getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.getMaxScaleOnAxis()-1)<1e-6);assert.ok(Math.abs(matrix.elements[13]-mole.y)<1e-6);
});
