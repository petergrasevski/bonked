import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,trackAt,TRACK_LENGTH,SEGMENTS} from '../shared/game.js';
import {buildDetailedScenery,buildDetailedBiome,detailedPalm,detailedIsland,createRockGeometry,islandContour,buildDesertPylons} from '../public/scenery.js';
function world(){return {
  static:new THREE.Group(),materials:new Map(),
  mat(color){if(!this.materials.has(color))this.materials.set(color,new THREE.MeshStandardMaterial({color}));return this.materials.get(color);},
  mesh(geometry,color,x=0,y=0,z=0,parent=this.static){const mesh=new THREE.Mesh(geometry,typeof color==='object'?color:this.mat(color));mesh.position.set(x,y,z);parent.add(mesh);return mesh;},
  box(x,y,z,w,h,d,color,parent=this.static){return this.mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);},
  cylinder(x,y,z,r1,r2,h,color,n=8,parent=this.static){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),color,x,y,z,parent);},
};}
function stats(w){let triangles=0,meshes=0,groups=new Set();w.static.updateMatrixWorld(true);w.static.traverse(o=>{
  if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite),'finite vertices, normals and UVs');
  const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);geometry.computeBoundingBox();const c=geometry.boundingBox.getCenter(new THREE.Vector3());groups.add(`${o.material.uuid}:${Math.floor(c.x/70)}:${Math.floor(c.z/70)}`);geometry.dispose();
});return {triangles,meshes,batches:groups.size};}
function dispose(w){w.static.traverse(o=>o.geometry?.dispose());for(const material of w.materials.values())material.dispose();}
test('coastal islands have irregular reproducible contours and outward-facing layered shores',()=>{
  const a=Array.from({length:40},(_,i)=>islandContour(i/40*Math.PI*2,7)),b=Array.from({length:40},(_,i)=>islandContour(i/40*Math.PI*2,7));
  assert.deepEqual(a,b);assert.ok(Math.max(...a)-Math.min(...a)>.2);
  const w=world(),island=detailedIsland(w,0,0,6,7);island.updateMatrixWorld(true);
  const top=new THREE.Raycaster(new THREE.Vector3(.5,10,.5),new THREE.Vector3(0,-1,0)).intersectObject(island)[0];
  assert.ok(top,'land remains visible from above');assert.ok(top.face.normal.y>.9);assert.ok(top.point.y>-.2);
  const side=new THREE.Raycaster(new THREE.Vector3(20,-1.5,0),new THREE.Vector3(-1,0,0)).intersectObject(island)[0];
  assert.ok(side,'bedrock faces outwards');assert.ok(side.face.normal.x>.5);assert.ok(stats(w).triangles>=500);dispose(w);
});
test('palm leaflets, ringed trunks and eroded rocks add detail within a small per-prop budget',()=>{
  const w=world(),palm=detailedPalm(w,0,0,1,0),s=stats(w);
  assert.ok(s.triangles>1200&&s.triangles<2200);assert.ok(w.materials.size<=4,'shared palette avoids a material per leaf');
  const bounds=new THREE.Box3().setFromObject(palm);assert.ok(bounds.max.y>5.5&&bounds.max.y<7);assert.ok(bounds.max.x-bounds.min.x>6);
  const rock=createRockGeometry(2,11),other=createRockGeometry(2,12);assert.notDeepEqual(rock.attributes.position.array,other.attributes.position.array);assert.ok(rock.attributes.position.array.every(Number.isFinite));rock.dispose();other.dispose();dispose(w);
});
test('whole-track scenery fits bounded geometry and batches without obsolete desert ramp placeholders',()=>{
  for(const id of ['coast','ice','desert']){
    selectTrack(id);const w=world();if(id==='coast')buildDetailedScenery(w,[.025,.15,.275,.40,.525,.65,.775,.90].map(fraction=>({fraction})));else buildDetailedBiome(w);
    const s=stats(w);assert.ok(s.triangles<300000,`${id} full-track triangle budget (${s.triangles})`);assert.ok(s.batches<1000,`${id} spatial/material batches (${s.batches})`);assert.ok(s.batches<s.meshes*.6,'small pieces merge into shared material batches');
    const kinds=[];w.static.traverse(o=>{if(o.userData.sceneryKind)kinds.push(o.userData.sceneryKind);});
    if(id==='ice')assert.ok(kinds.filter(k=>k==='pine').length>100);if(id==='desert')assert.equal(kinds.filter(k=>k==='ramp').length,0);dispose(w);
  }
  selectTrack('coast');
});

test('overpass pylons leave the entire lower road and its verges clear',()=>{
  selectTrack('desert');const w=world(),pylons=buildDesertPylons(w);
  assert.ok(pylons.length>10,'retain bridge supports away from the crossing');
  assert.ok(pylons.length<90,'remove the original intersecting supports');
  const bounds=pylons.map(p=>new THREE.Box3().setFromObject(p));
  // Sample the lower deck corridor independently of the placement algorithm,
  // including both shoulders and enough headroom for cars and roof weapons.
  for(let distance=-60;distance<=60;distance+=.5){
    const p=trackAt(.5+distance/TRACK_LENGTH);
    for(let lateral=-p.halfWidth-1.5;lateral<=p.halfWidth+1.5;lateral+=.25){
      const v=new THREE.Vector3(p.x+p.nx*lateral,p.y+1.5,p.z+p.nz*lateral);
      for(const box of bounds)assert.equal(box.containsPoint(v),false,'pillar intersects the lower road');
    }
  }
  const crossing=SEGMENTS[0];
  for(const side of [-1,1])assert.ok(!pylons.some(p=>Math.hypot(p.position.x-crossing.x-crossing.nx*(crossing.halfWidth+1)*side,p.position.z-crossing.z-crossing.nz*(crossing.halfWidth+1)*side)<.01),'both conflicting crossing pylons removed');
  dispose(w);selectTrack('coast');
});
