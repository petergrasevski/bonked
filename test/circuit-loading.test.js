import test from 'node:test';
import assert from 'node:assert/strict';
import {CircuitLoader} from '../public/circuit-loading.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('rapid circuit switches discard stale builds and only publish the newest world',async()=>{
  const builds=[],ready=[];const loader=new CircuitLoader({initialId:'coast',onReady:w=>ready.push(w),build:(id,options)=>{const d=deferred();builds.push({id,options,...d});return d.promise;}});
  loader.request('ice');assert.equal(loader.loading,true);loader.request('desert');loader.request('coast');assert.equal(builds[0].options.current(),false);
  let disposed=false;builds[0].resolve({dispose(){disposed=true;}});await Promise.resolve();await Promise.resolve();assert.equal(disposed,true);assert.equal(builds[1].id,'coast');
  const world={id:'coast'};builds[1].resolve(world);await loader.running;assert.deepEqual(ready,[world]);assert.equal(loader.loading,false);assert.equal(loader.readyId,'coast');
});
test('failed circuits expose retry without reloading on every snapshot',async()=>{
  let attempts=0;const loader=new CircuitLoader({initialId:'coast',onReady(){},build:async()=>{if(++attempts===1)throw Error('GPU unavailable');return {};}});
  loader.request('ice');await loader.running;assert.equal(loader.loading,false);assert.match(loader.error.message,/GPU/);loader.request('ice');assert.equal(attempts,1);
  loader.request('ice',{retry:true});await loader.running;assert.equal(attempts,2);assert.equal(loader.error,null);assert.equal(loader.readyId,'ice');
});
