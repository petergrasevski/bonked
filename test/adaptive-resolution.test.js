import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveResolution} from '../public/adaptive-resolution.js';
import {readDevLogs,saveDevLogs} from '../public/dev-settings.js';
const storage=()=>{const data=new Map();return {data,getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
function fixture(extra={}){let now=100000;const r=new AdaptiveResolution({pixelRatio:3,width:852,height:393,storage:storage(),now:()=>now,...extra});return {r,run:(ms,seconds,options)=>{for(let i=0;i<seconds*1000/ms;i++){now+=ms;r.sample(ms,options);}}};}
test('strong phones can reach native 3x instead of the old 1.7x ceiling',()=>{const {r,run}=fixture();run(1000/60,55);assert.equal(r.ratio,3);});
test('sustained slow frames lower resolution and avoid immediately oscillating up',()=>{const {r,run}=fixture();run(1000/60,50);run(40,5);const low=r.ratio;assert.ok(low<2);run(1000/60,6);assert.ok(r.ratio<2);run(1000/60,30);assert.ok(r.ratio>low+.5,'healthy frame rate restores sharpness without a 90-second wait');});
test('cache restores a proven setting, expires and distinguishes race load',()=>{
  const saved=storage(),{r,run}=fixture({storage:saved});run(1000/60,60);const restored=fixture({storage:saved,now:()=>200000}).r;assert.equal(restored.ratio,3);
  r.sample(16,{mode:'race'});assert.ok(r.ratio<=2);run(35,12,{mode:'race'});run(19,10,{mode:'race'});
  const next=fixture({storage:saved,now:()=>200000}).r;assert.equal(next.ratio,3);next.sample(16,{mode:'race'});assert.ok(next.ratio<2);
  const expired=new AdaptiveResolution({pixelRatio:3,width:852,height:393,storage:saved,now:()=>10**12});assert.equal(expired.ratio,2);
});
test('background, loading and one-off stalls do not lower resolution',()=>{const {r,run}=fixture();run(1000/60,60);run(100,10,{active:false});r.sample(2000);assert.equal(r.ratio,3);run(16.7,5);assert.equal(r.ratio,3);});
test('viewport pixel budget and native resolution always bound the buffer',()=>{
  const {r}=fixture();r.resize(4000,2000);assert.ok(r.ratio*r.ratio*4000*2000<=4000001);const desktop=fixture({pixelRatio:1}).r;assert.equal(desktop.ratio,1);
});
test('blocked storage is harmless, and dev logs are opt-in for new and existing users',()=>{
  const s=storage();s.setItem('bonked-audio-volumes','{"effects":0.4}');assert.equal(readDevLogs(s),false);saveDevLogs(s,true);assert.equal(readDevLogs(s),true);saveDevLogs(s,false);assert.equal(readDevLogs(s),false);
  const blocked={getItem(){throw Error();},setItem(){throw Error();}};assert.equal(readDevLogs(blocked),false);saveDevLogs(blocked,true);const {run}=fixture({storage:blocked});run(16.7,60);
});

test('even very slow visible rendering can recover by lowering resolution',()=>{const {r,run}=fixture();run(300,7);assert.ok(r.ratio<1.5);});

test('fixed high ignores frame drops and survives cache, scene and viewport changes',()=>{
  const saved=storage(),{r,run}=fixture({storage:saved});r.setQuality('high');assert.equal(r.ratio,3);run(100,12);assert.equal(r.ratio,3);run(45,12,{mode:'race'});assert.equal(r.ratio,3);
  const next=fixture({storage:saved}).r;assert.equal(next.quality,'high');assert.equal(next.ratio,3);next.resize(1000,600);assert.ok(next.ratio>2.5);assert.equal(next.ratio,next.max);
  next.setQuality('auto');assert.equal(next.quality,'auto');assert.ok(next.ratio<=2);assert.equal(fixture({storage:saved}).r.quality,'auto');
});
test('old blurry v1 cache is ignored and isolated moderate stalls do not downgrade',()=>{
  const saved=storage();saved.setItem('bonked-resolution-v1:coast:400x900:3:menu',JSON.stringify({ratio:.75,at:99999}));const {r,run}=fixture({storage:saved});assert.equal(r.ratio,2);run(1000/60,8);const before=r.ratio;run(24,1.1);assert.equal(r.ratio,before);
});
