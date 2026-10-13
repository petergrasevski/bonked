import test from 'node:test';
import assert from 'node:assert/strict';
import {readGraphicsQuality,saveGraphicsQuality,resolutionLabel} from '../public/graphics-settings.js';
test('graphics choice is opt-in, saved and tolerant of blocked or invalid storage',()=>{
  let value;const storage={getItem:()=>value,setItem:(key,v)=>{value=v;}};assert.equal(readGraphicsQuality(storage),'auto');saveGraphicsQuality(storage,'high');assert.equal(readGraphicsQuality(storage),'high');saveGraphicsQuality(storage,'auto');assert.equal(readGraphicsQuality(storage),'auto');value='garbage';assert.equal(readGraphicsQuality(storage),'auto');const blocked={getItem(){throw Error();},setItem(){throw Error();}};assert.equal(readGraphicsQuality(blocked),'auto');saveGraphicsQuality(blocked,'high');
});
test('resolution readout describes actual linear native scale and buffer dimensions',()=>{
  assert.equal(resolutionLabel({quality:'auto',ratio:2,nativeRatio:3,width:852,height:393}),'Auto · 67% of native · 1704 × 786');
  assert.equal(resolutionLabel({quality:'high',ratio:3,nativeRatio:3,width:852,height:393}),'High · 100% of native · 2556 × 1179');
});
