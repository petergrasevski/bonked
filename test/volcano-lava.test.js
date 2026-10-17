import test from 'node:test';
import assert from 'node:assert/strict';
import {VOLCANO_CROSSINGS,volcanoCrossingBounds,volcanoLavaGrip} from '../shared/volcano-lava.js';
import {selectTrack,TRACK_LENGTH,trackAt,spawnCar,stepCar,getLandscape,nearestTrack} from '../shared/game.js';
import {buildVolcanoStreams} from '../public/volcano-streams.js';
import * as THREE from 'three';

test('lava crossing covers every driving lane and restores grip beyond both visible banks',()=>{
  selectTrack('volcano');
  for(const [index,zone]of VOLCANO_CROSSINGS.entries())for(let lane=-1;lane<=1;lane+=.1){
    const [lo,hi]=volcanoCrossingBounds(lane,index),halfWidth=trackAt(zone.fraction).halfWidth;
    assert.equal(volcanoLavaGrip(zone.fraction+(lo+hi)/2/TRACK_LENGTH,lane*halfWidth,halfWidth,TRACK_LENGTH),.24);
    for(const along of [lo-.01,hi+.01])assert.equal(volcanoLavaGrip(zone.fraction+along/TRACK_LENGTH,lane*halfWidth,halfWidth,TRACK_LENGTH),1);
  }
  assert.equal(volcanoLavaGrip(.365,12,9,TRACK_LENGTH),1,'airborne/off-road contact must not become a road slick');
});

test('visible cross-track lava banks match authoritative contact at every lane',()=>{
  selectTrack('volcano');const group=new THREE.Group(),w={mesh(geometry,material){const m=new THREE.Mesh(geometry,material);group.add(m);return m;}};
  const result=buildVolcanoStreams(w,{sample:()=>({y:140})},trackAt),mesh=group.children.find(m=>m.name==='volcano-lava-crossing');assert.ok(mesh);
  const p=mesh.geometry.attributes.position;
  for(let j=0;j<=30;j++)for(const k of [0,8]){
    const lane=1.08-j/30*2.16,[lo,hi]=volcanoCrossingBounds(lane),q=trackAt(VOLCANO_CROSSINGS[0].fraction+(k?hi:lo)/TRACK_LENGTH),i=j*9+k;
    assert.ok(Math.abs(p.getX(i)-q.x-q.nx*q.halfWidth*lane)<.0001);assert.ok(Math.abs(p.getZ(i)-q.z-q.nz*q.halfWidth*lane)<.0001);assert.ok(Math.abs(p.getY(i)-q.y-.075)<.0001);
  }
  let triangles=0;for(const m of group.children){triangles+=m.geometry.index.count/3;for(const attribute of Object.values(m.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));m.geometry.dispose();}
  assert.ok(triangles<65000,'all mountain streams and crossing remain bounded');result.material.dispose();
});

// Exercise the shared physics used by authoritative simulation and prediction.
test('driving through visible lava retains sideways slip without reducing acceleration',()=>{
  selectTrack('volcano');
  const sample=fraction=>{
    const p=trackAt(fraction),c=Math.cos(p.angle),s=Math.sin(p.angle);
    const car={...spawnCar(),x:p.x,y:p.y,z:p.z,groundY:p.y,trackFraction:fraction,angle:p.angle,vx:c*20-s*5,vz:s*20+c*5};
    stepCar(car,{steer:0,throttle:1,reverse:false,brake:false});
    return {forward:car.vx*c+car.vz*s,lateral:-car.vx*s+car.vz*c};
  };
  const lava=sample(.365),road=sample(.345);
  assert.ok(lava.lateral>road.lateral+.35,'lava tyres retain noticeably more lateral momentum');
  assert.ok(Math.abs(lava.forward-road.forward)<1e-9,'engine acceleration remains available');
});

test('mountain streams crossing the terrain road gap never spike up to crater height',()=>{
  selectTrack('volcano');const meshes=[],w={mesh(geometry,material){const m=new THREE.Mesh(geometry,material);meshes.push(m);return m;}};
  const result=buildVolcanoStreams(w,getLandscape().surface,trackAt);let checked=0;
  for(const mesh of meshes){
    const p=mesh.geometry.attributes.position;
    if(mesh.name!=='volcano-lava-crossing')for(let i=0;i<p.count;i++){
      const road=nearestTrack(p.getX(i),p.getZ(i));
      if(road.distance<road.halfWidth-.5){checked++;assert.ok(p.getY(i)<road.y+.1,'stream remains at or below the road instead of creating a tall spike');}
    }
    mesh.geometry.dispose();
  }
  assert.ok(checked>0,'includes stream banks over the road terrain gap');result.material.dispose();
});
