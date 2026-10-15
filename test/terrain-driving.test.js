import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,trackAt,TRACK_LENGTH,spawnCar,stepCar,constrainRoad,terrainAt,drivingSurfaceAt,STEP,NEUTRAL,volcanoRecoverableAt,getLandscape} from '../shared/game.js';
import {FACTORY_TIP,factoryTipAngle} from '../shared/extra-circuits.js';
import {VOLCANO_RUNOFFS} from '../shared/volcano-terrain.js';
import {predictFleet} from '../shared/prediction.js';
function onHill(f,extra=9){const p=trackAt(f),off=p.halfWidth+extra,x=p.x-p.nx*off,z=p.z-p.nz*off,surface=terrainAt(x,z);return {p,car:{...spawnCar(),x,z,y:surface.y,groundY:surface.y,angle:Math.atan2(p.nz,p.nx),trackFraction:f,progress:f-.012}};}
for(const sign of [-1,1])test(`lowered factory panel releases cars at its ${sign<0?'rear':'front'} end`,()=>{
  selectTrack('factory');const f=FACTORY_TIP.fraction+sign*(FACTORY_TIP.length/2-.6)/TRACK_LENGTH,p=trackAt(f),lateral=-5,y=p.y+lateral*Math.tan(factoryTipAngle(.5,0));
  const c={...spawnCar(),x:p.x+p.nx*lateral,z:p.z+p.nz*lateral,y,groundY:y,angle:p.angle+(sign<0?Math.PI:0),vx:Math.cos(p.angle)*sign*16,vz:Math.sin(p.angle)*sign*16,trackFraction:f,raceTime:.5,factoryTipAt:0};
  let maxY=c.y;for(let i=0;i<25;i++){stepCar(c,NEUTRAL);c.raceTime+=STEP;maxY=Math.max(maxY,c.y);}
  assert.equal(c.falling,true);assert.ok(c.y<y-.5);assert.ok(maxY<y+.1,'car must not snap onto the higher fixed deck');
});
test('factory panel has a 50% longer full cycle and drops 20% slower',()=>{
  const {dropSeconds:drop,holdSeconds:hold,riseSeconds:rise}=FACTORY_TIP;assert.equal(drop,.2/.8);assert.ok(Math.abs(drop+hold+rise-2.2*1.5)<1e-10);
  assert.ok(factoryTipAngle(.2,0)<FACTORY_TIP.maxAngle);assert.equal(factoryTipAngle(drop,0),FACTORY_TIP.maxAngle);assert.equal(factoryTipAngle(drop+hold-.001,0),FACTORY_TIP.maxAngle);assert.equal(factoryTipAngle(drop+hold+rise+.001,0),0);
});
for(const f of VOLCANO_RUNOFFS){
  test(`volcano shoulder ${f} supports controlled driving and a return to the road`,()=>{
    selectTrack('volcano');const {p,car}=onHill(f);const surface=drivingSurfaceAt(car.x,car.z,f);assert.ok(surface.surface.ny>.94);constrainRoad(car);assert.equal(car.falling,false);
    let returned=false;for(let i=0;i<150&&!car.eliminated;i++){stepCar(car,{...NEUTRAL,throttle:1});car.raceTime+=STEP;const lateral=(car.x-p.x)*p.nx+(car.z-p.z)*p.nz;if(lateral>-p.halfWidth+2){returned=true;break;}}
    assert.equal(returned,true);assert.equal(car.falling,false);assert.equal(car.eliminated,false);assert.ok(Math.abs(car.y-p.y)<.8);
  });
  test(`volcano shoulder ${f} remains safe beyond the old off-road timer`,()=>{
    selectTrack('volcano');const {car}=onHill(f,5);for(let i=0;i<150;i++){stepCar(car,NEUTRAL);car.raceTime+=STEP;}assert.equal(car.eliminated,false);assert.ok(car.health>90);assert.equal(car.falling,false);
  });
}
test('steeper volcano slopes allow contact but overcome uphill engine traction',()=>{
  selectTrack('volcano');for(const f of [.41,.91]){const {p,car}=onHill(f),start=car.y;assert.ok(drivingSurfaceAt(car.x,car.z,f).surface.ny<.65);constrainRoad(car);
    for(let i=0;i<90&&!car.eliminated;i++){stepCar(car,{...NEUTRAL,throttle:1});car.raceTime+=STEP;}
    assert.ok(car.y<start-1);assert.equal(car.eliminated,true);assert.ok(car.volcanoFallTime>=1.2);}
});
test('terrain driving agrees between local prediction and authoritative physics',()=>{
  selectTrack('volcano');const {car}=onHill(VOLCANO_RUNOFFS[0]),a={...car},b={...car},input={...NEUTRAL,throttle:1};
  for(let i=0;i<90;i++){stepCar(a,input);a.raceTime+=STEP;predictFleet(b,[],input,STEP);}assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-9);assert.equal(a.y,b.y);assert.equal(a.health,b.health);assert.equal(a.falling,b.falling);
});
test('drivable volcano shoulders continue recording race progress',()=>{
  selectTrack('volcano');const {car,p}=onHill(.16,8);car.angle=p.angle;car.vx=Math.cos(p.angle)*10;car.vz=Math.sin(p.angle)*10;const before=car.progress;
  for(let i=0;i<45;i++){stepCar(car,{...NEUTRAL,throttle:1});car.raceTime+=STEP;}assert.ok(car.progress>before+.003);assert.equal(car.eliminated,false);
});

test('the volcano death timer starts on steep contact, not only on airborne falls',()=>{
  selectTrack('volcano');const {car}=onHill(.41);assert.equal(volcanoRecoverableAt(car),false);
  for(let i=0;i<40;i++){stepCar(car,NEUTRAL);car.raceTime+=STEP;}assert.equal(car.eliminated,false);assert.ok(car.volcanoFallTime>.6);
  for(let i=0;i<40&&!car.eliminated;i++){stepCar(car,NEUTRAL);car.raceTime+=STEP;}assert.equal(car.eliminated,true);
});
test('recoverable terrain ends where the actual slope becomes too steep',()=>{
  selectTrack('volcano');for(const f of VOLCANO_RUNOFFS){const near=onHill(f,9).car,far=onHill(f,65).car;assert.equal(volcanoRecoverableAt(near),true);assert.equal(volcanoRecoverableAt(far),false);}
});
test('landing on gentler ground below a cliff cannot reset the death timer',()=>{
  selectTrack('volcano');const p=trackAt(.41),terrain=getLandscape().surface;let found=false;
  for(let off=50;off<210;off+=3){const x=p.x-p.nx*off,z=p.z-p.nz*off,s=terrain.sample(x,z);if(s&&s.ny>.84&&s.y> -3){found=true;const c={...spawnCar(),x,z,y:s.y,groundY:s.y,trackFraction:.41};assert.equal(volcanoRecoverableAt(c),false);break;}}
  assert.equal(found,true);
});
test('returning to a recoverable shoulder clears accumulated volcano danger time',()=>{
  selectTrack('volcano');const {car}=onHill(.16,5);car.volcanoFallTime=1;stepCar(car,NEUTRAL);assert.equal(car.volcanoFallTime,0);assert.equal(car.eliminated,false);
});
test('volcano slope driving and timer are not enabled for ice, desert or factory',()=>{
  for(const id of ['ice','desert','factory']){selectTrack(id);const p=trackAt(.12),x=p.x-p.nx*(p.halfWidth+8),z=p.z-p.nz*(p.halfWidth+8);assert.equal(drivingSurfaceAt(x,z,.12),null);const c={...spawnCar(),x,z,y:p.y,groundY:p.y,trackFraction:.12,falling:true};
    for(let i=0;i<90&&!c.eliminated;i++){stepCar(c,NEUTRAL);c.raceTime+=STEP;}assert.equal(c.eliminated,true);assert.equal(c.volcanoFallTime,undefined);}
});
