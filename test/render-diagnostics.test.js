import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderDiagnostics} from '../public/render-diagnostics.js';
const info={render:{calls:400,triangles:600000},memory:{geometries:900,textures:14}};
test('render stats separate CPU work from frame cadence and include all scene passes',()=>{
  const d=new RenderDiagnostics();for(let i=0;i<20;i++)d.sample({frameMs:50,cpuMs:3,info,pixels:3000000});
  assert.equal(d.latest.fps,20);assert.equal(d.latest.cpuMs,3);assert.equal(d.latest.calls,400);assert.equal(d.latest.triangles,600000);
  assert.match(d.label(),/frame 50.0 ms · JS 3.0 ms/);assert.equal(d.latest.pixels,3000000);
});
test('opening settings and background pauses preserve the last scene stats; history stays bounded',()=>{
  const d=new RenderDiagnostics();for(let i=0;i<70;i++)d.sample({frameMs:1000,cpuMs:2,info,pixels:100});
  const last=d.latest;d.sample({frameMs:40,cpuMs:30,info,active:false});d.sample({frameMs:10000,cpuMs:1,info});
  assert.equal(d.latest,last);assert.equal(d.history.length,60);assert.equal(d.frames,0);
});
