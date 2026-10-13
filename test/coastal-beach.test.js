import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,SEGMENTS,TRACK_LENGTH,hasBarrier,getLandscape,nearestTrack} from '../shared/game.js';
import {BEACH_STEPS,SEA_LEVEL,beachSegments,beachPoint,beachShorePoint} from '../shared/beach-profile.js';
import {TerrainSurface} from '../shared/landscape.js';
import {createCoastalWater} from '../public/water.js';

test('curved beaches retain the road boundary, slope into the sea and stay outside the course',()=>{
  selectTrack('coast');const pairs=beachSegments({segments:SEGMENTS,trackLength:TRACK_LENGTH,hasBarrier});assert.ok(pairs.length>100);
  for(const {a,side}of pairs){
    assert.equal(hasBarrier((a.start+a.len*.5)/TRACK_LENGTH,side),false);
    const edge=beachPoint(a,0,side);assert.ok(Math.abs(Math.hypot(edge[0]-a.x,edge[2]-a.z)-(a.halfWidth+.59))<1e-8);
    assert.equal(edge[1],a.y-.19);let prior=edge;
    for(let i=1;i<=BEACH_STEPS;i++){
      const p=beachPoint(a,i/BEACH_STEPS,side);assert.ok(p[1]<prior[1]);
      // Lower than a 32 degree bank: no abrupt vertical chute off the road.
      assert.ok((prior[1]-p[1])/Math.hypot(p[0]-prior[0],p[2]-prior[2])<.66);
      const road=nearestTrack(p[0],p[2]);assert.ok(road.distance>road.halfWidth);prior=p;
    }
    assert.ok(prior[1]<SEA_LEVEL);
  }
});

test('the foam shoreline intersects the same beach triangles as collision, on both sides and bends',()=>{
  selectTrack('coast');const beachSurface=new TerrainSurface();for(const band of getLandscape().beaches)beachSurface.add(band);
  let checked=0;for(const {a,side}of beachSegments({segments:SEGMENTS,trackLength:TRACK_LENGTH,hasBarrier})){
    const shore=beachShorePoint(a,side,SEA_LEVEL,beachSurface);assert.ok(shore);const hit=beachSurface.sample(shore[0],shore[2]);
    assert.ok(hit);assert.ok(Math.abs(hit.y-SEA_LEVEL)<1e-6);checked++;
  }
  assert.ok(checked>100);
});

test('ocean and all animated shoreline strips remain two render batches with finite geometry',()=>{
  selectTrack('coast');
  const original=globalThis.document;
  const context=new Proxy({}, {get:(target,key)=>target[key]??(()=>{})});
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})};
  try{
    const fog=new THREE.FogExp2(0xb6c6cb,.002),ocean=createCoastalWater(SEGMENTS,SEGMENTS,fog,null,getLandscape().lands);
    assert.ok(ocean.water.isMesh&&ocean.shore.isMesh);assert.equal(ocean.shore.material.uniforms.time,ocean.waterMaterial.uniforms.time);
    assert.equal(ocean.shore.material.depthWrite,false);
    for(const mesh of [ocean.water,ocean.shore]){
      for(const attribute of Object.values(mesh.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));
      assert.ok(mesh.geometry.attributes.position.count<60000);mesh.geometry.dispose();mesh.material.dispose();
    }
    ocean.depthTexture.dispose();
  }finally{if(original===undefined)delete globalThis.document;else globalThis.document=original;}
});
