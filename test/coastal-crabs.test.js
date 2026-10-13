import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,CRABS,hasBarrier,spawnCar,stepCar,collideCoastalCrabs,NEUTRAL,STEP} from '../shared/game.js';
import {crabState,CRAB_PERIOD,collideCrabs} from '../shared/coastal-crabs.js';
import {predictFleet} from '../shared/prediction.js';
import {buildCoastalCrabs,updateCoastalCrabs} from '../public/coastal-crabs.js';
test('three crabs per open beach, road crossed in one second, no crabs on other tracks',()=>{
  selectTrack('coast');assert.equal(CRABS.length,12);
  const groups=new Map();for(const crab of CRABS){assert.equal(hasBarrier(crab.fraction),false);const section=Math.floor(crab.fraction*24);groups.set(section,(groups.get(section)||0)+1);
    const plain={...crab,phase:0},speed=2*(crab.halfWidth+crab.radius),approach=6/speed;
    const a=crabState(plain,approach),b=crabState(plain,approach+1);assert.ok(Math.abs(Math.hypot(b.x-a.x,b.z-a.z)-speed)<1e-8);
    assert.equal(crabState(plain,4).visible,false);assert.equal(crabState(plain,CRAB_PERIOD+.5).side,-crabState(plain,.5).side);
  }assert.deepEqual([...groups.values()],[3,3,3,3]);
  for(const id of ['desert','ice']){selectTrack(id);assert.equal(CRABS.length,0);}selectTrack('coast');assert.equal(CRABS.length,12);
});
test('crabs push cars without taking damage or displacement; airborne cars can clear them',()=>{
  selectTrack('coast');const crab={...CRABS[0],phase:0},seconds=6/(2*(crab.halfWidth+crab.radius))+.5,pose=crabState(crab,seconds),before=JSON.stringify(crab);
  const car={...spawnCar(),x:pose.x+crab.nx*1.8,z:pose.z+crab.nz*1.8,y:0,angle:crab.angle,vx:0,vz:0};
  collideCrabs(car,[crab],seconds);assert.ok(car.vx*crab.nx+car.vz*crab.nz>10);assert.equal(car.health,100);assert.equal(JSON.stringify(crab),before);assert.deepEqual(crabState(crab,seconds),pose);
  const airborne={...car,x:pose.x,z:pose.z,y:4,vx:0,vz:0};collideCrabs(airborne,[crab],seconds);assert.equal(airborne.x,pose.x);assert.equal(airborne.vx,0);
});
test('server and fleet prediction agree through a crab crossing',()=>{
  selectTrack('coast');const crab=CRABS[0],base={...spawnCar(),x:crab.x,z:crab.z,y:0,groundY:0,angle:crab.angle,trackFraction:crab.fraction,progress:crab.fraction-.012,raceTime:0};
  const server={...base},client={...base};for(let i=0;i<60;i++){stepCar(server,NEUTRAL,STEP);server.raceTime+=STEP;collideCoastalCrabs(server,server.raceTime);predictFleet(client,[],NEUTRAL,STEP);assert.ok(Math.abs(server.x-client.x)<1e-9);assert.ok(Math.abs(server.z-client.z)<1e-9);}
  assert.ok(Math.hypot(server.x-base.x,server.z-base.z)>1,'crossing pushes a stationary car');
});
test('twelve animated crabs stay within three shared draws and finite transforms',()=>{
  selectTrack('coast');const group=buildCoastalCrabs(new THREE.Scene());assert.equal(group.children.length,3);assert.deepEqual(group.children.map(m=>m.count),[12,12,96]);
  for(const time of [0,.5,1,8,500]){updateCoastalCrabs(group,time);for(const m of group.children){assert.ok([...m.instanceMatrix.array].every(Number.isFinite));assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));}}
  group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('offscreen crab instances are omitted without changing their simulation descriptors',()=>{
  selectTrack('coast');const group=buildCoastalCrabs(new THREE.Scene()),before=JSON.stringify(group.userData.descriptors),camera=new THREE.PerspectiveCamera(58,1,.2,260);
  camera.position.set(10000,100,10000);camera.lookAt(10000,0,10100);camera.updateMatrixWorld();updateCoastalCrabs(group,.5,camera);assert.deepEqual(group.children.map(m=>m.count),[0,0,0]);assert.equal(JSON.stringify(group.userData.descriptors),before);
  updateCoastalCrabs(group,.5);assert.deepEqual(group.children.map(m=>m.count),[12,12,96]);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
