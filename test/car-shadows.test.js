import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCarShadows} from '../public/car-shadows.js';
import {selectTrack,spawnCar,trackAt,drivingSurfaceAt} from '../shared/game.js';
function carAt(track,fraction){selectTrack(track);const p=trackAt(fraction),floor=drivingSurfaceAt(p.x,p.z,fraction);return {...spawnCar(),x:p.x,z:p.z,y:floor.y,groundY:floor.y,angle:p.angle,pitch:Math.atan(floor.grade||0),trackFraction:fraction};}
function dispose(shadows){shadows.mesh.geometry.dispose();shadows.mesh.material.dispose();}
test('contact shadows stay on slopes and the correct crossing deck with upward-facing triangles',()=>{
  for(const [track,fraction]of [['coast',.025],['desert',.18],['desert',.34],['desert',0],['desert',.5],['ice',.01]]){
    const car=carAt(track,fraction),shadows=createCarShadows();shadows.update([car]);
    const g=shadows.mesh.geometry,p=g.attributes.position,count=g.drawRange.count;assert.ok(count>0,`${track} ${fraction}`);
    for(let i=0;i<count;i++){
      const floor=drivingSurfaceAt(p.getX(i),p.getZ(i),fraction);assert.ok(floor);
      assert.ok(Math.abs(p.getY(i)-floor.y-.018)<.006,`${track} ${fraction} surface height`);
    }
    for(let i=0;i<count;i+=3){
      const ax=p.getX(i+1)-p.getX(i),az=p.getZ(i+1)-p.getZ(i),bx=p.getX(i+2)-p.getX(i),bz=p.getZ(i+2)-p.getZ(i);
      assert.ok(az*bx-ax*bz>0,'front face points upwards');
    }
    if(track==='desert'&&fraction===0)assert.ok(p.getY(0)>19,'upper bridge shadow');
    if(track==='desert'&&fraction===.5)assert.ok(p.getY(0)<.1,'lower deck shadow');
    dispose(shadows);
  }
});
test('contact shadows fade on takeoff and never float under eliminated cars or across unsupported ground',()=>{
  const car=carAt('desert',.25),shadows=createCarShadows();shadows.update([car]);const opacity=shadows.mesh.geometry.attributes.strength.getX(0);
  shadows.update([{...car,y:car.y+.8}]);assert.ok(shadows.mesh.geometry.attributes.strength.getX(0)<opacity*.3);
  for(const changes of [{y:car.y+2},{falling:true},{eliminated:true},{x:car.x+500}]){
    shadows.update([{...car,...changes}]);assert.equal(shadows.mesh.visible,false);assert.equal(shadows.mesh.geometry.drawRange.count,0);
  }
  shadows.update([{...car,eliminated:true,wrecked:true}]);assert.equal(shadows.mesh.visible,true,'grounded wreck keeps its contact shadow');
  selectTrack('ice');shadows.update([{...car,x:0,z:-40,y:1,groundY:1,trackFraction:.2}]);assert.equal(shadows.mesh.visible,false,'no shadow inside split ice gap');
  dispose(shadows);
});
test('road edge contact shadows only emit supported tiles and retain bounded reusable storage',()=>{
  const car=carAt('desert',.25),p=trackAt(.25),shadows=createCarShadows();
  shadows.update([car]);const full=shadows.mesh.geometry.drawRange.count;
  const edge={...car,x:car.x+p.nx*p.halfWidth,z:car.z+p.nz*p.halfWidth};shadows.update([edge]);
  const g=shadows.mesh.geometry,positions=g.attributes.position;assert.ok(g.drawRange.count>0&&g.drawRange.count<full);
  for(let i=0;i<g.drawRange.count;i+=3){
    let x=0,z=0;for(let j=0;j<3;j++){x+=positions.getX(i+j)/3;z+=positions.getZ(i+j)/3;}
    assert.ok(drivingSurfaceAt(x,z,car.trackFraction),'triangle stays on the road');
  }
  const buffers=Object.values(g.attributes).map(a=>a.array);
  for(let i=0;i<20;i++)shadows.update(Array.from({length:12},()=>car));
  assert.equal(g.drawRange.count,8*16*3);assert.equal(positions.count,8*16*3);
  Object.values(g.attributes).forEach((a,i)=>assert.equal(a.array,buffers[i]));
  assert.equal(shadows.mesh.castShadow,false);assert.equal(shadows.mesh.material.depthWrite,false);assert.equal(shadows.mesh.material.side,THREE.FrontSide);
  for(const name of Object.keys(THREE.UniformsLib.fog))assert.ok(shadows.mesh.material.uniforms[name],`fog uniform ${name} is present`);
  shadows.update([]);assert.equal(g.drawRange.count,0);assert.equal(shadows.mesh.visible,false);dispose(shadows);
});
