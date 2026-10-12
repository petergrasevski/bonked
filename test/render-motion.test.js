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

test('fractional-tick reconciliation preserves pose when snapshot velocities change',()=>{
  selectTrack('ice');const smooth=new RenderCorrections(),a={id:'a',x:10,z:2,y:1,angle:.2,pitch:.1,roll:.1,progress:.1,renderVx:30,renderVz:4,renderRise:2,renderTurn:.2,renderPitch:.3,renderRoll:.4,renderProgress:30/TRACK_LENGTH};
  const b={...a,x:9.8,z:2.1,renderVx:22,renderVz:1,renderRise:1,renderTurn:.1,renderPitch:.2,renderRoll:.1,renderProgress:22/TRACK_LENGTH},remainder=STEP*.7;
  const before=smooth.render(a,0,remainder);smooth.reconcile([a],[b],remainder);const after=smooth.render(b,0,remainder);
  for(const field of ['x','z','y','angle','pitch','roll','progress'])assert.ok(Math.abs(before[field]-after[field])<1e-12,field+' remains continuous');
  assert.deepEqual(b,{...a,x:9.8,z:2.1,renderVx:22,renderVz:1,renderRise:1,renderTurn:.1,renderPitch:.2,renderRoll:.1,renderProgress:22/TRACK_LENGTH},'rendering does not change physics');
});

test('network position corrections do not create an instantaneous speed kick',()=>{
  selectTrack('ice');const smooth=new RenderCorrections(),a={id:'a',x:10,z:0,y:1,angle:0,vx:30,vz:0,progress:.1},b={...a,x:9.5,progress:.1-.5/TRACK_LENGTH};
  smooth.reconcile([a],[b]);const start=smooth.render(b,0),dt=1e-5;
  const next=smooth.render({...b,x:b.x+30*dt,progress:b.progress+30*dt/TRACK_LENGTH},dt);
  assert.ok(Math.abs((next.x-start.x)/dt-30)<.01,'visible velocity is continuous across reconciliation');
  assert.ok(Math.abs((next.progress-start.progress)*TRACK_LENGTH/dt-30)<.01,'camera progress has the same velocity continuity');
});

test('correction damping is frame-rate independent and clears removed cars',()=>{
  selectTrack('ice');const a={id:'a',x:10,z:0,y:1,angle:0,vx:30,vz:0},b={...a,x:9.5};
  const results=[30,60,120].map(hz=>{const s=new RenderCorrections();s.reconcile([a],[b]);let view;for(let i=0;i<hz;i++)view=s.render(b,1/hz);s.reconcile([b],[]);assert.equal(s.errors.size+s.rates.size+s.velocities.size,0);return view.x;});
  assert.ok(Math.max(...results)-Math.min(...results)<1e-12);assert.ok(Math.abs(results[0]-b.x)<1e-6);
});

test('uneven 20 Hz updates do not produce repeated visible speed jumps at 30/60/120 Hz',()=>{
  selectTrack('ice');
  for(const hz of [30,60,120]){
    const smooth=new RenderCorrections(),dt=1/hz,arrivals=[.037,.061,.043,.052,.068,.039],offsets=[.25,-.17,.32,-.26,.05,-.2];
    let next=.05,packet=0,bias=0,previous=null,lastSpeed=30;const kicks=[],speeds=[];
    for(let frame=0;frame<hz*8;frame++){
      const t=frame*dt,tick=Math.floor((t+1e-9)/STEP)*STEP,remainder=Math.max(0,t-tick);
      let car={id:'a',x:30*tick+bias,y:1,z:0,angle:0,vx:30,vz:0,renderVx:30,progress:(30*tick+bias)/TRACK_LENGTH,renderProgress:30/TRACK_LENGTH};
      if(t>=next){const old=car;bias=offsets[packet%offsets.length];car={...car,x:30*tick+bias,progress:(30*tick+bias)/TRACK_LENGTH};smooth.reconcile([old],[car],remainder);next+=arrivals[packet++%arrivals.length];}
      const pose=smooth.render(car,dt,remainder);
      if(previous){const speed=(pose.x-previous.x)/dt;if(t>1){speeds.push(speed);kicks.push(Math.abs(speed-lastSpeed));}lastSpeed=speed;}previous=pose;
    }
    const rms=Math.sqrt(speeds.reduce((s,v)=>s+(v-30)**2,0)/speeds.length),p95=kicks.sort((a,b)=>a-b)[Math.floor(kicks.length*.95)];
    assert.ok(rms<1.2,`${hz} Hz speed-error RMS: ${rms}`);assert.ok(p95<2.2,`${hz} Hz frame speed jumps: ${p95}`);
  }
});
