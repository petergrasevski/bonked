import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,OBSTACLES,terrainAt} from '../shared/game.js';
import {buildSceneryDetails,SCENERY_TYPES,sceneryRoadClear} from '../public/scenery-details.js';
function world(){return {static:new THREE.Group(),scene:new THREE.Scene()};}
function dispose(result){result.group.traverse(o=>o.geometry?.dispose());result.group.children[0]?.material.dispose();}
test('all three maps get twelve distinct static scenery types with bounded geometry and shared materials',()=>{
  for(const id of ['coast','desert','ice']){
    selectTrack(id);const before=JSON.stringify(OBSTACLES),w=world(),r=buildSceneryDetails(w);
    assert.deepEqual([...new Set(r.placements.map(p=>p.type))].sort(),[...SCENERY_TYPES[id]].sort());assert.ok(r.placements.length>=30&&r.placements.length<=36);
    assert.ok(r.triangles<35000);assert.ok(r.batches<=60);assert.equal(w.static.children.length,0);assert.equal(w.scene.children.length,1);
    const materials=new Set();for(const mesh of r.group.children){materials.add(mesh.material);assert.ok(mesh.geometry.boundingSphere);for(const a of Object.values(mesh.geometry.attributes))assert.ok(a.array.every(Number.isFinite));assert.equal(mesh.material.transparent,false);}
    assert.equal(materials.size,1);assert.equal(JSON.stringify(OBSTACLES),before,'visuals add no physics obstacles');
    for(const p of r.placements){assert.ok(sceneryRoadClear(p.x,p.z,p.radius));if(id!=='coast')assert.equal(p.y,terrainAt(p.x,p.z).y);if(id==='ice')assert.ok(Math.abs(p.x)>=490||Math.abs(p.z)>=64);}
    dispose(r);
  }
});
test('placement is deterministic and respects existing scenery footprints',()=>{
  selectTrack('coast');const a=buildSceneryDetails(world()),b=buildSceneryDetails(world());assert.deepEqual(a.placements,b.placements);
  const w=world(),p=a.placements[0],reservation=new THREE.Group(),block=new THREE.Mesh(new THREE.BoxGeometry(16,8,16));reservation.position.set(p.x,0,p.z);reservation.add(block);w.static.add(reservation);
  const c=buildSceneryDetails(w);for(const q of c.placements)assert.ok(Math.abs(q.x-p.x)>=8+q.radius||Math.abs(q.z-p.z)>=8+q.radius);
  block.geometry.dispose();block.material.dispose();for(const r of [a,b,c])dispose(r);
});
