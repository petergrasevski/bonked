import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK_LENGTH,START_FRACTION,STEP,NEUTRAL,spawnCar,trackAt} from '../shared/game.js';
import {cameraFrame,createChase} from '../shared/chase.js';
import {RenderCorrections} from '../shared/netcode.js';
import {predictFleet} from '../shared/prediction.js';

test('120 Hz cars and route camera advance together between 60 Hz simulation ticks',()=>{
  selectTrack('ice');const corrections=new RenderCorrections(),start=.1,base=trackAt(start),frames=[];
  for(let frame=0;frame<120;frame++){
    const t=frame/120,tick=Math.floor((t+1e-9)/STEP)*STEP,remainder=Math.max(0,t-tick);
    const car={id:'a',x:base.x+30*tick,y:base.y,z:base.z,vx:30,vz:0,angle:0,pitch:.2*tick,roll:.1*tick,progress:start-START_FRACTION+30*tick/TRACK_LENGTH,trackFraction:start+30*tick/TRACK_LENGTH,renderPitch:.2,renderRoll:.1,renderProgress:30/TRACK_LENGTH};
    const pose=corrections.render(car,1/120,remainder),camera=cameraFrame(createChase([pose]),[pose]);frames.push({pose,camera});
  }
  for(let i=1;i<frames.length;i++){
    assert.ok(Math.abs(frames[i].pose.x-frames[i-1].pose.x-.25)<1e-8);
    assert.ok(Math.abs(frames[i].camera.x-frames[i-1].camera.x-.25)<1e-7,'camera must not alternate between still and double-distance frames');
    assert.ok(Math.abs(frames[i].pose.pitch-frames[i-1].pose.pitch-.2/120)<1e-10,'pitch must advance every display frame');
    assert.ok(Math.abs(frames[i].pose.roll-frames[i-1].pose.roll-.1/120)<1e-10);
  }
});

test('20 Hz snapshots preserve visible slope pose and camera progress, including fully acknowledged updates',()=>{
  selectTrack('desert');const corrections=new RenderCorrections(),before={id:'a',x:20,y:3,z:10,angle:.2,pitch:.11,roll:.03,progress:.1,trackFraction:.1,vx:20,vz:5,renderVx:20,renderVz:5,renderRise:2,renderTurn:.3,renderPitch:.2,renderRoll:-.1,renderProgress:20/TRACK_LENGTH};
  const after={id:'a',x:19.6,y:2.9,z:9.95,angle:.19,pitch:.09,roll:.02,progress:.1-.4/TRACK_LENGTH,trackFraction:.1,vx:20,vz:5};
  const previousView=corrections.render(before,0,STEP/2);corrections.reconcile([before],[after]);const newView=corrections.render(after,0,STEP/2);
  for(const key of ['x','y','z','angle','pitch','roll','progress'])assert.ok(Math.abs(previousView[key]-newView[key])<1e-12,`${key} must not snap when a snapshot replaces predicted state`);
  assert.equal(after.pitch,.09,'visual correction must not change authoritative body orientation');assert.equal(after.progress,.1-.4/TRACK_LENGTH);
  let settled;for(let i=0;i<120;i++)settled=corrections.render(after,1/60,0);
  assert.ok(Math.abs(settled.pitch-after.pitch)<1e-8);assert.ok(Math.abs(settled.progress-after.progress)<1e-8);
});

test('nudge motion also advances on the half-tick display frame',()=>{
  selectTrack('ice');const p=trackAt(.12),car={...spawnCar(),id:'a',x:p.x,y:p.y,z:p.z,groundY:p.y,angle:p.angle,trackFraction:.12},before={...car};
  predictFleet(car,[],{...NEUTRAL,nudge:1},STEP);const movement=Math.hypot(car.x-before.x,car.z-before.z);assert.ok(movement>.3);
  const view=new RenderCorrections().render(car,0,STEP/2);
  assert.ok(Math.abs(view.x-car.x-(car.x-before.x)/2)<1e-10);
  assert.ok(Math.abs(view.z-car.z-(car.z-before.z)/2)<1e-10,'kinematic shove must not stutter on every second frame');
});

test('route teleports reset camera progress correction even at a stacked crossing',()=>{
  selectTrack('desert');const corrections=new RenderCorrections(),car={id:'a',x:0,y:20,z:0,angle:0,pitch:.1,roll:0,progress:0,vx:20,vz:0};
  corrections.reconcile([car],[{...car,x:.2,pitch:.09}]);const crossing={...car,y:0,progress:.5};corrections.reconcile([car],[crossing]);
  const view=corrections.render(crossing,0);assert.equal(view.progress,.5);assert.equal(view.y,0);assert.equal(corrections.errors.size,0);
});
