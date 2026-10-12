import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {selectTrack,nearestTrack} from '../shared/game.js';
import {buildGlacierValley,updateGlacierValley,chairliftPose,createRiverGeometry,createRiverBanks,glacierRiverAt} from '../public/glacier-valley.js';
function world(){return {scene:new THREE.Scene(),static:new THREE.Group(),materials:new Map(),
  mat(c){if(!this.materials.has(c))this.materials.set(c,new THREE.MeshStandardMaterial({color:c}));return this.materials.get(c);},
  mesh(g,c,x=0,y=0,z=0,p=this.static){const m=new THREE.Mesh(g,typeof c==='object'?c:this.mat(c));m.position.set(x,y,z);p.add(m);return m;},
  box(x,y,z,a,b,c,color,p=this.static){return this.mesh(new THREE.BoxGeometry(a,b,c),color,x,y,z,p);},
  cylinder(x,y,z,r1,r2,h,c,n=8,p=this.static){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),c,x,y,z,p);},
};}
function dispose(w){for(const g of [w.static,w.scene])g.traverse(o=>{o.geometry?.dispose();if(o.material?.isShaderMaterial)o.material.dispose();});for(const m of w.materials.values())m.dispose();}
test('river flows only in the central valley, clear of both straights and the end turns',()=>{
  selectTrack('ice');const g=createRiverGeometry(),p=g.attributes.position;
  for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));assert.equal(g.attributes.riverAcross.count,p.count);assert.equal(g.attributes.flowUV.count,p.count);assert.equal(g.attributes.flowDirection.count,p.count);
  const bankGeometry=createRiverBanks(),banks=bankGeometry.attributes.position;
  // Test the actual perpendicular cross-sections, including their outer banks.
  for(const attribute of [p,banks])for(let i=0;i<attribute.count;i+=3){const t=nearestTrack(attribute.getX(i),attribute.getZ(i));assert.ok(t.distance-t.halfWidth>8,'river and snowy banks stay at least eight meters from the road');}
  let low=Infinity,high=-Infinity,reversals=0,last=0;
  for(let x=-440;x<=440;x+=2){const r=glacierRiverAt(x);low=Math.min(low,r.z);high=Math.max(high,r.z);const direction=Math.sign(r.tz);if(last&&direction!==last)reversals++;last=direction;assert.ok(Math.abs(Math.hypot(r.tx,r.tz)-1)<1e-9);}
  assert.ok(high-low>24,'visible broad meanders replace the almost-straight stream');assert.ok(reversals>=8,'asymmetric bends vary along the river');assert.ok(p.count/3<6000,'water remains one bounded mesh');bankGeometry.dispose();
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial()),hits=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0)).intersectObject(mesh);
  assert.ok(hits.length);assert.ok(hits[0].face.normal.y>.99);assert.ok(hits[0].point.y>-4&&hits[0].point.y<-3);
  g.dispose();mesh.material.dispose();selectTrack('coast');
});
test('valley surrounds the course while retaining road clearance and a bounded geometry budget',()=>{
  selectTrack('ice');const w=world(),v=buildGlacierValley(w);w.static.updateMatrixWorld(true);let triangles=0,mountains=0,lodges=0,runs=0;
  w.static.traverse(o=>{
    if(o.userData.sceneryKind==='mountain')mountains++;if(o.userData.sceneryKind==='ski-lodge')lodges++;if(o.userData.sceneryKind==='ski-run')runs++;
    if(!o.geometry)return;for(const a of Object.values(o.geometry.attributes))assert.ok(a.array.every(Number.isFinite));triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    if(o.parent.userData.sceneryKind==='mountain'){
      const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=12){const q=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld),t=nearestTrack(q.x,q.z);assert.ok(t.distance-t.halfWidth>12,'mountain foothills do not obstruct the circuit');}
    }
  });
  assert.ok(mountains>=35&&mountains<=55);assert.equal(lodges,2);assert.equal(runs,2);assert.ok(triangles<35000);assert.equal(v.lifts.length,2);assert.equal(w.scene.children.length,3,'river plus one instanced chair draw per resort');
  const ray=new THREE.Raycaster(new THREE.Vector3(-208,200,165),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(w.static)[0].point.y>70,'summit visible from above');dispose(w);selectTrack('coast');
});
test('chairlifts follow closed continuous cable loops and animate all instances without geometry allocation',()=>{
  const w=world(),v=buildGlacierValley(w),original=v.lifts.map(l=>l.chairs.geometry);
  for(const lift of v.lifts){
    for(const distance of [0,lift.length,lift.length+Math.PI*lift.width,lift.length*2+Math.PI*lift.width,lift.total]){
      const a=chairliftPose(lift,distance-1e-5),b=chairliftPose(lift,distance+1e-5);assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.0001,'no jumps through terminals or cable junctions');
    }
    const a=chairliftPose(lift,17),b=chairliftPose(lift,17+lift.total);for(const key of ['x','y','z'])assert.ok(Math.abs(a[key]-b[key])<1e-8);
    assert.equal(lift.chairs.count,18);
  }
  const spheres=v.lifts.map(l=>l.chairs.boundingSphere);
  const before=v.lifts[0].chairs.instanceMatrix.array.slice();updateGlacierValley(v,4500);assert.notDeepEqual(before,v.lifts[0].chairs.instanceMatrix.array);assert.equal(v.riverMaterial.uniforms.time.value,4.5);
  for(let i=0;i<v.lifts.length;i++){assert.equal(v.lifts[i].chairs.geometry,original[i]);assert.equal(v.lifts[i].chairs.boundingSphere,spheres[i],'chairlift culling bound is reused rather than rebuilt per frame');assert.ok(v.lifts[i].chairs.instanceMatrix.array.every(Number.isFinite));assert.ok(Number.isFinite(v.lifts[i].chairs.boundingSphere.radius));}dispose(w);
});
