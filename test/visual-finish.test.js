import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VisualFinish} from '../public/visual-finish.js';

function renderer(){
  return {capabilities:{maxSamples:4},target:null,draws:[],width:1600,height:900,
    getDrawingBufferSize(v){return v.set(this.width,this.height);},
    getRenderTarget(){return this.target;},setRenderTarget(t){this.target=t;},
    render(scene,camera){this.draws.push({scene,camera,target:this.target});}};
}
test('visual finish draws game geometry once, resizes buffers and preserves the caller target',()=>{
  const r=renderer(),finish=new VisualFinish(r),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,16/9,.2,1600);
  finish.render(scene,camera);
  assert.equal(r.draws.filter(d=>d.scene===scene).length,1);
  assert.equal(r.draws.length,4);
  assert.equal(r.target,null);
  assert.equal(finish.target.width,1600);assert.equal(finish.blurA.width,400);assert.equal(finish.blurB.height,225);
  const prior=new THREE.WebGLRenderTarget(2,2);r.target=prior;r.width=801;r.height=401;
  finish.render(scene,camera);
  assert.equal(r.target,prior);assert.equal(finish.target.height,401);assert.equal(finish.blurA.width,201);assert.equal(finish.blurB.height,101);
  assert.deepEqual(finish.finish.uniforms.inverseProjection.value.elements,camera.projectionMatrixInverse.elements);
  finish.dispose();prior.dispose();
});
test('render failure restores the caller target and effect disposal releases owned resources',()=>{
  const r=renderer(),finish=new VisualFinish(r),prior=new THREE.WebGLRenderTarget(2,2);r.target=prior;
  r.render=()=>{throw Error('render interrupted');};
  assert.throws(()=>finish.render(new THREE.Scene(),new THREE.PerspectiveCamera()),/render interrupted/);
  assert.equal(r.target,prior);
  const resources=[finish.target,finish.blurA,finish.blurB,finish.blur,finish.finish,finish.geometry];
  const disposed=new Set();resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed.add(resource)));
  finish.dispose();assert.equal(disposed.size,resources.length);prior.dispose();
});
