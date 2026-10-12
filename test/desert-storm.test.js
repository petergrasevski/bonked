import test from 'node:test';
import assert from 'node:assert/strict';
import {desertStormAt,stormCoverage,stormGustAt,applyDesertWind,STORM_DELAY} from '../shared/desert-storm.js';
import {createDustCloud,stormHaze} from '../public/desert-storm.js';
import {selectTrack,spawnCar,stepCar,trackAt,STEP,NEUTRAL} from '../shared/game.js';
import {predictFleet} from '../shared/prediction.js';
test('storms traverse the map for 20 seconds followed by a full minute clear',()=>{
  assert.equal(desertStormAt(14.99).active,false);assert.equal(desertStormAt(15).active,true);assert.equal(desertStormAt(34.99).active,true);
  for(const t of [35,50,80,94.99])assert.equal(desertStormAt(t).active,false);
  assert.equal(desertStormAt(95).active,true);assert.ok(desertStormAt(17).x<desertStormAt(33).x);assert.ok(desertStormAt(97).x>desertStormAt(113).x);
  const storm=desertStormAt(25);assert.equal(stormCoverage(storm,storm.x,storm.z),1);assert.equal(stormCoverage(storm,storm.x+storm.rx+1,storm.z),0);
  assert.ok(Math.PI*storm.rx*storm.rz/(540*340)>.45);assert.ok(Math.PI*storm.rx*storm.rz/(540*340)<.65);
  for(const t of [-100,NaN,Infinity,1e6])assert.ok(Number.isFinite(desertStormAt(t).x));
});
test('wind alternates left, right and backward in smooth one-second bursts and respects cloud boundaries',()=>{
  const probe=age=>{const t=STORM_DELAY+age,s=desertStormAt(t);return stormGustAt(t,s.x,s.z,0);};
  assert.ok(probe(3.5).z<0);assert.ok(probe(6.5).x<0);assert.ok(probe(9.5).z>0);
  for(const age of [3,4,4.5,5.5,6,7,8.5])assert.equal(probe(age).strength,0);
  assert.ok(probe(3.001).strength<.001);assert.ok(probe(3.999).strength<.001);
  const s=desertStormAt(21.5);assert.equal(stormGustAt(21.5,s.x+600,s.z).strength,0);
  const car={x:s.x,z:s.z,angle:0,vx:30,vz:0};applyDesertWind(car,21.5,.5);assert.ok(car.vx<30&&car.vx>=18);assert.ok(Math.abs(car.vz)<1e-8);
  for(const state of ['finished','eliminated','falling','overturned']){const c={...car,[state]:true};applyDesertWind(c,21.5,1);assert.equal(c.vx,car.vx);}
});
test('desert wind agrees exactly between authoritative ticks and client prediction, leaving other circuits unchanged',()=>{
  selectTrack('desert');const p=trackAt(.05),base={...spawnCar(),x:p.x,y:p.y,z:p.z,groundY:p.y,angle:p.angle,trackFraction:.05,progress:.038,vx:Math.cos(p.angle)*25,vz:Math.sin(p.angle)*25,raceTime:23.99};
  const server={...base},client={...base};
  for(let i=0;i<90;i++){stepCar(server,{...NEUTRAL,throttle:1});server.raceTime+=STEP;predictFleet(client,[],{...NEUTRAL,throttle:1},STEP);assert.ok(Math.abs(server.x-client.x)<1e-9);assert.ok(Math.abs(server.z-client.z)<1e-9);}
  for(const id of ['coast','ice']){selectTrack(id);const a=spawnCar(),b={...a,raceTime:24.5};for(let i=0;i<30;i++){stepCar(a,NEUTRAL);stepCar(b,NEUTRAL);assert.equal(a.x,b.x);assert.equal(a.z,b.z);}}
});
test('dust uses two fixed GPU draws and keeps near-track visibility readable at all camera heights',()=>{
  const dust=createDustCloud({mobile:true}),copy=createDustCloud({mobile:true});assert.equal(dust.group.children.length,2);assert.equal(dust.clouds.count,48);assert.equal(dust.grains.geometry.attributes.position.count,550);assert.deepEqual(dust.clouds.instanceMatrix.array,copy.clouds.instanceMatrix.array);
  const buffer=dust.clouds.instanceMatrix.array,storm=dust.update(25);assert.equal(dust.group.visible,true);assert.equal(dust.clouds.instanceMatrix.array,buffer);
  for(const height of [20,50,100,200,400]){const {density}=stormHaze(storm,storm,height);assert.ok(1-Math.exp(-((density*height*1.5)**2))<.65,'cars stay readable through the haze');}
  dust.update(36);assert.equal(dust.group.visible,false);
  for(const d of [dust,copy])d.group.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});
});
