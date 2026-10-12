import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK_LENGTH,TRACK,trackAt,nearestTrack,hasBarrier,spawnCar,stepCar,botInput,collideDesertMoles,MOLES,STEP,NEUTRAL,CAR_LENGTH,CAR_WIDTH,TOP_SPEED} from '../shared/game.js';
import {DESERT_JUMPS,DESERT_MOUNTAIN,DESERT_MOLE_ZONE,desertRampLift,desertRampGrade,desertHalfWidth,moleState} from '../shared/desert-features.js';

const atMole=(mole)=>{const c=spawnCar(),d=CAR_LENGTH/2+mole.radius-.25;return {...c,x:mole.x-Math.cos(mole.angle)*d,z:mole.z-Math.sin(mole.angle)*d,y:mole.y,groundY:mole.y,angle:mole.angle,trackFraction:mole.fraction,vx:Math.cos(mole.angle)*30,vz:Math.sin(mole.angle)*30,pitch:0,roll:0};};

test('desert adds a continuous mountain bridge while preserving both crossing decks and original X/Z route',()=>{
  selectTrack('desert');assert.equal(trackAt(0).y,20);assert.ok(trackAt(.5).y<.001);
  for(let i=0;i<TRACK.length;i+=23){const t=i/TRACK.length*Math.PI*2;assert.ok(Math.abs(TRACK[i].x-270*Math.sin(t))<1e-10);assert.ok(Math.abs(TRACK[i].z-170*Math.sin(2*t))<1e-10);}
  for(const f of [.22,.25,.28])assert.equal(trackAt(f).y,DESERT_MOUNTAIN.height);
  let before=trackAt(.15).y;for(let f=.16;f<.214;f+=.005){const next=trackAt(f).y;assert.ok(next>before);before=next;}
  before=trackAt(.29).y;for(let f=.30;f<.394;f+=.005){const next=trackAt(f).y;assert.ok(next<before);before=next;}
  for(const f of [.15,.19,.30,.38])assert.equal(hasBarrier(f),false);
  for(const f of [.14,.22,.27,.4,.665])assert.equal(hasBarrier(f),true);
});

test('four 10m jump wedges share collision height and forward slope with their authored descriptors',()=>{
  selectTrack('desert');assert.equal(DESERT_JUMPS.length,4);
  for(const ramp of DESERT_JUMPS){
    for(const t of [.1,.5,.9]){
      const fraction=ramp.fraction-ramp.length*(1-t)/TRACK_LENGTH,p=trackAt(fraction),floor=nearestTrack(p.x,p.z,fraction);
      assert.ok(Math.abs(desertRampLift(fraction,TRACK_LENGTH)-ramp.height*t)<1e-9);
      assert.ok(Math.abs(floor.y-p.y-ramp.height*t)<1e-7);
      assert.ok(Math.abs(floor.grade-p.grade-desertRampGrade(fraction,TRACK_LENGTH))<1e-8);
    }
    assert.equal(desertRampLift(ramp.fraction+.001,TRACK_LENGTH),0);
  }
});

test('mole plaza retains its compact plateau and keeps every hazard inside the fences',()=>{
  selectTrack('desert');const z=DESERT_MOLE_ZONE;assert.equal(z.length/TOP_SPEED,7);assert.equal(z.halfWidth*2,30.24);
  for(let metres=-125;metres<=125;metres+=10){const f=z.center+metres/TRACK_LENGTH,p=trackAt(f);assert.ok(p.halfWidth>15.11);assert.ok(p.y<.0001);assert.equal(hasBarrier(f),true);}
  for(const side of [-1,1]){
    const edge=z.center+side*z.length/2/TRACK_LENGTH,outer=edge+side*z.transition/TRACK_LENGTH,middle=(edge+outer)/2;
    assert.equal(desertHalfWidth(outer,TRACK_LENGTH),9);assert.ok(Math.abs(desertHalfWidth(middle,TRACK_LENGTH)-12.06)<1e-8);
  }
  assert.equal(MOLES.length,26);for(const mole of MOLES){assert.ok(Math.abs((mole.fraction-z.center)*TRACK_LENGTH)<126);assert.ok(Math.abs(mole.lateral)+mole.radius<=z.halfWidth-.64,'moles stay inside the fenced field');}
});

test('moles have deterministic staggered warning, raised and fully retracted phases',()=>{
  selectTrack('desert');const mole=MOLES[0];
  assert.deepEqual(moleState(mole,-mole.phase),{rise:0,warning:0,active:false});
  const warning=moleState(mole,2.3-mole.phase);assert.equal(warning.rise,0);assert.ok(warning.warning>.49&&warning.warning<.51);assert.equal(warning.active,false);
  assert.deepEqual(moleState(mole,3.3-mole.phase),{rise:1,warning:0,active:true});
  for(let t=0;t<12;t+=.25){const active=MOLES.filter(m=>moleState(m,t).active).length;assert.ok(active>2&&active<MOLES.length-2);assert.deepEqual(moleState(mole,t),moleState(mole,t+6));}
});

test('raised moles stop and damage approaching cars; cooldown avoids repeated damage and prediction matches the shove',()=>{
  selectTrack('desert');const mole=MOLES[0],car=atMole(mole),predicted={...car},now=3.3-mole.phase;
  const impact=collideDesertMoles(car,now);assert.equal(impact.length,1);assert.ok(car.health<100);assert.ok(car.vx*Math.cos(mole.angle)+car.vz*Math.sin(mole.angle)<0);
  collideDesertMoles(predicted,now,{damage:false});assert.equal(predicted.health,100);assert.equal(predicted.x,car.x);assert.equal(predicted.z,car.z);assert.equal(predicted.vx,car.vx);assert.equal(predicted.vz,car.vz);
  const health=car.health,again=atMole(mole);Object.assign(car,{x:again.x,z:again.z,vx:again.vx,vz:again.vz});collideDesertMoles(car,now+.01);assert.equal(car.health,health);
});

test('retracted holes and raised moles below an airborne chassis are driveable',()=>{
  selectTrack('desert');const mole=MOLES[0],flat=atMole(mole),before={...flat};
  assert.deepEqual(collideDesertMoles(flat,-mole.phase),[]);assert.deepEqual(flat,before);
  const flying={...before,y:mole.y+mole.height+.2};assert.deepEqual(collideDesertMoles(flying,3.3-mole.phase),[]);assert.equal(flying.health,100);assert.equal(flying.x,before.x);
});

test('a mole emerging directly under a stationary car separates it once without repeated damage or vibration',()=>{
  selectTrack('desert');const mole=MOLES[0],car={...atMole(mole),x:mole.x,z:mole.z,vx:0,vz:0};
  collideDesertMoles(car,3-mole.phase);const x=car.x,z=car.z;
  for(let i=0;i<30;i++)collideDesertMoles(car,3+i*STEP-mole.phase);
  assert.equal(car.x,x);assert.equal(car.z,z);assert.equal(car.health,100);
});

test('a bot completes all four desert jumps, open mountain slopes and active mole plaza without being eliminated',()=>{
  selectTrack('desert');const car=spawnCar();let jumps=0,airborne=false;
  for(let i=0;i<18000&&car.progress<1&&!car.eliminated;i++){
    stepCar(car,botInput(car));car.raceTime+=STEP;collideDesertMoles(car,car.raceTime);
    if(car.rampFlight&&!airborne)jumps++;airborne=!!car.rampFlight;
  }
  assert.ok(car.progress>=1);assert.equal(jumps,4);assert.ok(car.health>0);assert.equal(car.falling,false);
});

test('extra moles target the centre and inside shortcut while leaving room between hazards',()=>{
  selectTrack('desert');const extra=MOLES.filter(m=>m.id.startsWith('desert-mole-cluster-'));
  assert.equal(extra.length,8);assert.equal(extra.filter(m=>Math.abs(m.lateral)<2).length,2);
  assert.equal(extra.filter(m=>m.lateral>=10).length,6);
  // Confirm the heavily populated side actually lies towards the bend's centre.
  for(const mole of extra.filter(m=>m.lateral>=10)){
    const p=trackAt(mole.fraction),q=trackAt(mole.fraction+.001);
    const turn=Math.sin(q.angle-p.angle);assert.ok(turn*mole.lateral>0,'cluster is on the shorter inner arc');
  }
  for(let i=0;i<MOLES.length;i++)for(let j=i+1;j<MOLES.length;j++){
    const a=MOLES[i],b=MOLES[j];assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>a.radius+b.radius+CAR_WIDTH,'raised heads leave a car-width gap');
  }
});

test('narrower mole field preserves all longitudinal positions and only moves the outermost hazards',()=>{
  selectTrack('desert');const cluster=MOLES.filter(m=>m.id.startsWith('desert-mole-cluster-')),original=[[-42,-1],[42,1.5],[-66,14],[-38,10],[-10,15],[18,11],[46,14],[74,10]];
  cluster.forEach((m,i)=>{assert.ok(Math.abs((m.fraction-DESERT_MOLE_ZONE.center)*TRACK_LENGTH-original[i][0])<1e-8);assert.ok(Math.abs(m.lateral-original[i][1])<=2.24);if(Math.abs(original[i][1])<12)assert.equal(m.lateral,original[i][1]);});
});
