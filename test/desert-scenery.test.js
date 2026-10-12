import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,trackAt,nearestTrack,TRACK_LENGTH} from '../shared/game.js';
import {DESERT_JUMPS,DESERT_MOUNTAIN,DESERT_MOLE_ZONE,desertRampLift} from '../shared/desert-features.js';
import {buildDesertScenery,desertRampPoint} from '../public/desert-scenery.js';
function world(){return {static:new THREE.Group(),materials:new Map(),
  mat(c){if(!this.materials.has(c))this.materials.set(c,new THREE.MeshStandardMaterial({color:c}));return this.materials.get(c);},
  mesh(g,c,x=0,y=0,z=0,p=this.static){const m=new THREE.Mesh(g,typeof c==='object'?c:this.mat(c));m.position.set(x,y,z);p.add(m);return m;},
  box(x,y,z,a,b,c,col,p=this.static){return this.mesh(new THREE.BoxGeometry(a,b,c),col,x,y,z,p);},
  cylinder(x,y,z,r1,r2,h,c,n=8,p=this.static){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),c,x,y,z,p);},
};}
function dispose(w){w.static.traverse(o=>o.geometry?.dispose());for(const m of w.materials.values())m.dispose();}
test('four detailed jump wedges match the authored collision ramp heights and face upward',()=>{
  selectTrack('desert');const w=world(),s=buildDesertScenery(w);w.static.updateMatrixWorld(true);assert.equal(s.jumps.length,4);
  for(let i=0;i<DESERT_JUMPS.length;i++){
    const ramp=DESERT_JUMPS[i];assert.equal(s.jumps[i].userData.jumpId,ramp.id);assert.equal(s.jumps[i].userData.fraction,ramp.fraction);
    for(const t of [.15,.5,.85]){const fraction=ramp.fraction-ramp.length*(1-t)/TRACK_LENGTH,p=trackAt(fraction),point=desertRampPoint(ramp,ramp.length*t,0),height=p.y+desertRampLift(fraction,TRACK_LENGTH);
      assert.ok(Math.abs(point[1]-height-.035)<1e-8);const hit=new THREE.Raycaster(new THREE.Vector3(point[0],height+5,point[2]),new THREE.Vector3(0,-1,0)).intersectObject(s.jumps[i])[0];assert.ok(hit,'ramp visible from above');assert.ok(hit.face.normal.y>.8);assert.ok(hit.point.y>height+.02&&hit.point.y<height+.09,'painted deck follows the physical wedge');
    }
  }
  dispose(w);selectTrack('coast');
});
test('two mountain masses support the elevated road and leave the bridge canyon and crossing open',()=>{
  selectTrack('desert');const w=world(),s=buildDesertScenery(w);assert.equal(s.mountains.length,2);w.static.updateMatrixWorld(true);
  let vertices=0;
  for(const mountain of s.mountains)mountain.traverse(o=>{if(!o.geometry)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=3){vertices++;const road=nearestTrack(p.getX(i),p.getZ(i));if(road.distance<road.halfWidth+.5)assert.ok(p.getY(i)<road.y-.1,'mountain stays below every nearby road surface');assert.ok(Math.hypot(p.getX(i),p.getZ(i))>100,'no mountain obstruction at the original crossing');}});
  assert.ok(vertices>1000);
  const center=trackAt((DESERT_MOUNTAIN.ascentEnd+DESERT_MOUNTAIN.bridgeEnd)/2),ray=new THREE.Raycaster(new THREE.Vector3(center.x,80,center.z),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObjects(s.mountains).length,0,'open canyon beneath the bridge');const hit=ray.intersectObject(s.bridge)[0];assert.ok(hit&&hit.point.y>DESERT_MOUNTAIN.height-1,'bridge deck spans the gap');
  dispose(w);selectTrack('coast');
});
test('expanded mole plateau meets ground and all added desert detail stays inside mobile geometry budgets',()=>{
  selectTrack('desert');const w=world(),s=buildDesertScenery(w);w.static.updateMatrixWorld(true);let triangles=0,min=Infinity,max=-Infinity;const batches=new Set();
  s.plateau.traverse(o=>{if(!o.geometry)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){min=Math.min(min,p.getY(i));max=Math.max(max,p.getY(i));}});assert.ok(min<=-4&&max<0);assert.equal(trackAt(DESERT_MOLE_ZONE.center).halfWidth,15.12);
  w.static.traverse(o=>{if(!o.geometry)return;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));const g=o.geometry.clone().applyMatrix4(o.matrixWorld);g.computeBoundingBox();const c=g.boundingBox.getCenter(new THREE.Vector3());batches.add(`${o.material.uuid}:${Math.floor(c.x/70)}:${Math.floor(c.z/70)}`);g.dispose();});
  assert.ok(triangles<25000);assert.ok(batches.size<120);assert.ok(w.materials.size<14);dispose(w);selectTrack('coast');
});
