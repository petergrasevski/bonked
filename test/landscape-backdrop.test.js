import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,nearestTrack,OBSTACLES} from '../shared/game.js';
import {buildLandscapeBackdrop,canyonPoint,islandPoint} from '../public/landscape-backdrop.js';
function dispose(g){const materials=new Set();g.traverse(o=>{o.geometry?.dispose();if(o.material)materials.add(o.material);});for(const m of materials)m.dispose();}
test('canyon encloses the desert continuously while keeping all terrain clear of the course',()=>{
  selectTrack('desert');let minHeight=Infinity;
  for(let i=0;i<=224;i++){const angle=i/224*Math.PI*2;for(let b=0;b<=10;b++){const [x,y,z]=canyonPoint(angle,b),road=nearestTrack(x,z);assert.ok(road.distance-road.halfWidth>45);}minHeight=Math.min(minHeight,canyonPoint(angle,8)[1]);}
  assert.ok(minHeight>150);for(let b=0;b<=10;b++){const a=canyonPoint(0,b),z=canyonPoint(Math.PI*2,b);for(let i=0;i<3;i++)assert.ok(Math.abs(a[i]-z[i])<1e-8);}
});
test('mainland stays on one side of the coast with beaches, high cliffs and mountain peaks',()=>{
  selectTrack('coast');let highest=0;
  for(let i=0;i<224;i++)for(const r of [1.06,.97,.87,.80,.76,.60,.36,0]){const [x,y,z]=islandPoint(i/224*Math.PI*2,r),road=nearestTrack(x,z);assert.ok(road.distance-road.halfWidth>75);assert.ok(z< -285);highest=Math.max(highest,y);}
  assert.ok(highest>240);assert.ok(islandPoint(0,.87)[1]<3);assert.ok(islandPoint(0,.76)[1]>60);
});
test('backdrops use bounded opaque render batches without physics changes or shadow passes',()=>{
  for(const id of ['coast','desert','ice']){selectTrack(id);const before=JSON.stringify(OBSTACLES),scene=new THREE.Scene(),group=buildLandscapeBackdrop(scene,id);let draws=0,triangles=0;
    group.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.count||1);assert.equal(o.castShadow,false);assert.equal(o.material.transparent,false);for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));});
    assert.equal(draws,id==='coast'?3:id==='desert'?1:0);assert.ok(triangles<100000);assert.equal(JSON.stringify(OBSTACLES),before);dispose(group);
  }
});
