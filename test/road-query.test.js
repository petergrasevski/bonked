import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,SEGMENTS,TRACK_LENGTH,nearestTrack,trackAt,clamp} from '../shared/game.js';
import {desertRampLift,desertRampGrade} from '../shared/desert-features.js';
function exhaustive(x,z,hint,id){let score=Infinity,best;for(const s of SEGMENTS){const t=clamp(((x-s.x)*s.dx+(z-s.z)*s.dz)/(s.len*s.len),0,1),px=s.x+s.dx*t,pz=s.z+s.dz*t,d=Math.hypot(x-px,z-pz),fraction=(s.start+s.len*t)/TRACK_LENGTH,penalty=id==='desert'&&hint!==null?Math.max(0,Math.abs(((fraction-hint+.5)%1+1)%1-.5)*TRACK_LENGTH-50)*2:0;if(d+penalty<score){score=d+penalty;best={x:px,z:pz,distance:d,fraction,y:s.y+s.dy*t+(id==='desert'?desertRampLift(fraction,TRACK_LENGTH):0),grade:s.dy/s.len+(id==='desert'?desertRampGrade(fraction,TRACK_LENGTH):0),nx:s.nx,nz:s.nz,halfWidth:s.halfWidth+(s.nextHalfWidth-s.halfWidth)*t};}}return best;}
test('spatial road queries exactly match exhaustive contacts, including crossings and route hints',()=>{
 let seed=721;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(const id of ['coast','ice','desert','coast']){selectTrack(id);const points=[[0,0,null],[0,0,0],[0,0,.5],[2000,-2000,null]];for(let i=0;i<160;i++){const f=random(),p=trackAt(f),offset=(random()-.5)*120;points.push([p.x+p.nx*offset,p.z+p.nz*offset,i%3?f:null]);}for(const [x,z,hint]of points){const actual=nearestTrack(x,z,hint),expected=exhaustive(x,z,hint,id);for(const key of Object.keys(expected))assert.ok(Math.abs(actual[key]-expected[key])<1e-9,`${id} ${key} at ${x},${z}`);}}
});
test('binary road lookup preserves wraparound and exact segment boundary behavior',()=>{
 for(const id of ['coast','ice','desert']){selectTrack(id);for(const s of SEGMENTS.filter((_,i)=>i%11===0))for(const delta of [-1e-9,0,1e-9]){const f=(s.start+s.len+delta)/TRACK_LENGTH,d=((f%1+1)%1)*TRACK_LENGTH,old=SEGMENTS.find(s=>s.start+s.len>=d)||SEGMENTS.at(-1),t=(d-old.start)/old.len,p=trackAt(f);assert.ok(Math.abs(p.x-old.x-old.dx*t)<1e-10);assert.ok(Math.abs(p.z-old.z-old.dz*t)<1e-10);}assert.deepEqual(trackAt(0),trackAt(1));}
});
