import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildLandmarks,animateLandmarks} from '../public/landmarks.js';
import {selectTrack} from '../shared/game.js';

// Exercise actual landmark geometry without requiring a GPU or DOM texture canvas.
function fixture(){
  const scene=new THREE.Scene(),staticGroup=new THREE.Group(),materials=new Map();scene.add(staticGroup);
  return {scene,static:staticGroup,camera:new THREE.PerspectiveCamera(),emitParticles:false,palm(){},texture(){return new THREE.Texture();},
    mesh(geometry,color,x=0,y=0,z=0,parent=staticGroup){
      let material=color;
      if(typeof color!=='object'){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color}));material=materials.get(color);}
      const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
    },
    box(x,y,z,w,h,d,color,parent){return this.mesh(new THREE.BoxGeometry(w,h,d),color,x,y,z,parent);},
    cylinder(x,y,z,r1,r2,h,color,n=8,parent){return this.mesh(new THREE.CylinderGeometry(r1,r2,h,n),color,x,y,z,parent);},
  };
}

test('detailed coastal landmarks have finite geometry within a bounded mobile budget',()=>{
  selectTrack('coast');const w=fixture();w.landmarks=buildLandmarks(w);w.scene.updateMatrixWorld(true);
  let triangles=0;const batches=new Set();
  w.scene.traverse(o=>{
    if(!o.isMesh)return;
    const p=o.geometry.attributes.position;
    for(const n of p.array)assert.ok(Number.isFinite(n));
    triangles+=(o.geometry.index?.count??p.count)/3*(o.isInstancedMesh?o.count:1);
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);geometry.computeBoundingBox();
    const center=geometry.boundingBox.getCenter(new THREE.Vector3());
    batches.add(`${o.material.uuid}:${Math.floor(center.x/70)}:${Math.floor(center.z/70)}`);geometry.dispose();
  });
  // Count excludes generic palms (owned by scenery); no per-detail dynamic draws.
  assert.ok(triangles>30000 && triangles<52000,`landmark triangles: ${triangles}`);
  assert.ok(batches.size<=108,`whole-track landmark batches: ${batches.size}`);
  assert.deepEqual(w.landmarks.map(l=>l.kind),['volcano','geyser','waterfall','lighthouse']);
});

test('animated landmark parts survive removal of the static merge source',()=>{
  selectTrack('coast');const w=fixture();w.landmarks=buildLandmarks(w);
  w.scene.remove(w.static);
  for(const l of w.landmarks)assert.equal(l.mesh.parent,w.scene,`${l.kind} must remain in the live scene`);
  animateLandmarks(w,500);
  const volcano=w.landmarks.find(l=>l.kind==='volcano');assert.ok(volcano.mesh.scale.x>.85&&volcano.mesh.scale.x<=1);
  assert.equal(w.landmarks.find(l=>l.kind==='lighthouse').mesh.rotation.y,.175);
  assert.equal(w.landmarks.find(l=>l.kind==='waterfall').time.value,.5);
  const drops=w.landmarks.find(l=>l.kind==='geyser').droplets;assert.equal(drops.count,48);
  for(const value of drops.instanceMatrix.array)assert.ok(Number.isFinite(value));
});


test('Palm Island shoreline is continuous, upward facing and below the road',()=>{
  selectTrack('coast');const w=fixture();buildLandmarks(w);
  const shore=[];w.static.traverse(o=>{if(o.userData.sceneryKind==='palm-island-shore')shore.push(o);});
  assert.equal(shore.length,3,'three continuous bands replace overlapping island cylinders');
  for(const mesh of shore){
    const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;
    for(let i=0;i<p.count;i++){
      assert.ok(p.getY(i)<-.1,'terrain must not cover the driving surface');
      assert.ok(n.getY(i)>=0,'shoreline faces must point toward the sky');
    }
  }
});

test('four coastal landmarks sit on connected land crossed by the road',()=>{
  selectTrack('coast');const w=fixture();buildLandmarks(w);w.scene.updateMatrixWorld(true);
  assert.deepEqual(w.coastalLandforms.map(l=>l.kind),['volcano','geyser','ruins','waterfall']);
  for(const land of w.coastalLandforms){
    const meshes=[];w.static.traverse(o=>{if(o.userData.sceneryKind==='connected-land'&&o.userData.landmark===land.kind)meshes.push(o);});
    for(const mesh of meshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++){assert.ok(p.getY(i)<-.1);assert.ok(n.getY(i)>=0,'land normals must face upward');}}
    for(const anchor of [land.roadAnchor,land.featureAnchor]){
      const ray=new THREE.Raycaster(new THREE.Vector3(anchor.x,10,anchor.z),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObjects(meshes);assert.ok(hits.length,`${land.kind} must have connected ground at each anchor`);
      assert.ok(hits[0].point.y> -2.05,'lowered terrain stays above the sea');
      if(anchor===land.roadAnchor)assert.ok(hits[0].point.y>-.5,'bank meets the road underside');
    }
  }
});

test('sand stretches slope from below the road down beneath the sea',()=>{
  selectTrack('coast');const w=fixture();buildLandmarks(w);const beaches=[];
  w.static.traverse(o=>{if(o.userData.sceneryKind==='coastal-beach')beaches.push(o);});assert.equal(beaches.length,2);
  let low=0,high=-Infinity;
  for(const mesh of beaches){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++){const y=p.getY(i);low=Math.min(low,y);high=Math.max(high,y);assert.ok(n.getY(i)>0);}}
  assert.ok(high<-.1&&high>-.3);assert.ok(low< -3);
});
