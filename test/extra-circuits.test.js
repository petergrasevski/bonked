import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACKS,selectTrack,TRACK,SEGMENTS,TRACK_LENGTH,trackAt,nearestTrack,spawnCar,stepCar,botInput,STEP,PICKUP_LOCATIONS,BOOST_PADS,hasBarrier} from '../shared/game.js';
import {EXTRA_CIRCUITS,FACTORY_BELTS,FACTORY_TABLES,FACTORY_PRESSES,VOLCANO_HOT,VOLCANO_VENTS,beltDirection,beltTravel,ventState,pressState,advanceCircuitHeat,heatSpeedMultiplier,heatDamageRate,heatFlameStrength,circuitSurface,applyCircuitForces} from '../shared/extra-circuits.js';
import {predictFleet} from '../shared/prediction.js';
function placed(id,fraction,lane=0){selectTrack(id);const p=trackAt(fraction),road={...p,fraction},car={...spawnCar(),x:p.x+p.nx*p.halfWidth*lane,z:p.z+p.nz*p.halfWidth*lane,y:p.y,groundY:p.y,trackFraction:fraction,angle:p.angle,vx:p.nz*25,vz:-p.nx*25};return {car,road};}
const forward=(car,road)=>car.vx*road.nz-car.vz*road.nx;
for(const id of EXTRA_CIRCUITS){
  test(`${id}: complete, closed circuit with stable geometry and usable race objects`,()=>{
    selectTrack(id);assert.ok(TRACK_LENGTH>1500&&TRACK_LENGTH<2300);assert.ok(TRACK.length>=1500);assert.ok(TRACKS[id].name);assert.deepEqual(trackAt(0),trackAt(1));
    assert.ok(PICKUP_LOCATIONS.length>=25);assert.ok(BOOST_PADS.length>=6);
    for(const s of SEGMENTS){assert.ok(s.len>0&&Number.isFinite(s.nx)&&Number.isFinite(s.y));assert.ok(s.halfWidth>=8);assert.ok(Math.abs(s.halfWidth-s.nextHalfWidth)/s.len<.85);assert.ok(Math.abs(s.dy/s.len)<.25);}
    for(const p of [...PICKUP_LOCATIONS,...BOOST_PADS]){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(nearestTrack(p.x,p.z).distance<trackAt(p.fraction).halfWidth);}
  });
  test(`${id}: bots finish three laps across changing mechanism phases`,()=>{
    for(const startTime of [0,8,20]){selectTrack(id);const c=spawnCar();c.raceTime=startTime;
      for(let i=0;i<30000&&c.progress<3&&!c.eliminated;i++){stepCar(c,botInput(c));c.raceTime+=STEP;assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.y));}
      assert.ok(c.progress>=3,`${id} at ${startTime}s stopped at ${c.progress}`);assert.equal(c.health,100);assert.equal(c.falling,false);
    }
  });
  test(`${id}: prediction and authoritative driving share surface forces`,()=>{
    const f=id==='factory'?FACTORY_BELTS[0].fraction:VOLCANO_HOT[0].fraction;
    const {car}=placed(id,f,.55);car.raceTime=8;const expected={...car},predicted={...car};
    for(let i=0;i<30;i++){const input=botInput(expected);stepCar(expected,input);expected.raceTime+=STEP;predictFleet(predicted,[],input,STEP);}
    assert.ok(Math.hypot(predicted.x-expected.x,predicted.z-expected.z)<1e-8);assert.equal(predicted.circuitHeat,expected.circuitHeat);
  });
}
test('factory belts reverse on the shared race clock and opposing lanes carry opposing forces',()=>{
  assert.equal(beltDirection(0),1);assert.equal(beltDirection(4.5),-1);assert.equal(beltDirection(7.5),1);assert.ok(Math.abs(beltDirection(3.75))<1e-10);
  const speeds=[];for(const lane of [-.55,0,.55]){const {car,road}=placed('factory',FACTORY_BELTS[0].fraction,lane);applyCircuitForces(car,'factory',road,TRACK_LENGTH,0,1);speeds.push(forward(car,road));}
  assert.ok(speeds[0]<speeds[1]&&speeds[1]<speeds[2]);
});
test('factory presses warn before stamping, slow exposed racers, and leave a safe lane',()=>{
  assert.equal(pressState(1.6).warning,true);assert.equal(pressState(1.6).active,false);assert.equal(pressState(2.5).active,true);
  for(const lane of [pressState(2.5).lane,-.6]){const {car,road}=placed('factory',FACTORY_PRESSES[0],lane);applyCircuitForces(car,'factory',road,TRACK_LENGTH,2.5,STEP);assert.equal(car.stun>0,lane>0);}
});
test('volcano hot lanes have no flooded shoulder or overheating slowdown',()=>{
  selectTrack('volcano');const f=VOLCANO_HOT[0].fraction,p=trackAt(f);
  for(const seconds of [0,16])assert.deepEqual(circuitSurface('volcano',f,p.halfWidth*.9,p.halfWidth,TRACK_LENGTH,seconds),{kind:'heat'});
  assert.equal(heatSpeedMultiplier(0),1.4);assert.ok(Math.abs(heatSpeedMultiplier(3)-1.8)<1e-12);
});
test('volcanic vents launch only on an active, marked lane',()=>{
  for(const seconds of [1.8,2.55]){const {car,road}=placed('volcano',VOLCANO_VENTS[0],-.58);applyCircuitForces(car,'volcano',road,TRACK_LENGTH,seconds,STEP);assert.equal(car.vy>0,seconds===2.55);}
});
test('all five circuits retain independent caches and barrier rules',()=>{
  for(const id of Object.keys(TRACKS)){selectTrack(id);const before=trackAt(.28),length=TRACK_LENGTH;selectTrack(id==='coast'?'factory':'coast');selectTrack(id);assert.deepEqual(trackAt(.28),before);assert.equal(TRACK_LENGTH,length);}
  selectTrack('factory');assert.ok(!hasBarrier(.33,-1)&&!hasBarrier(.33,1));selectTrack('volcano');assert.equal(hasBarrier(VOLCANO_HOT[0].fraction,1),true);assert.equal(hasBarrier(VOLCANO_HOT[0].fraction,-1),false);
});

test('hot lanes and conveyors offer a meaningful speed benefit beyond the normal engine cap',()=>{
  for(const [id,f,seconds]of [['volcano',VOLCANO_HOT[0].fraction,0],['factory',FACTORY_BELTS[0].fraction,0]]){
    const speeds=[];
    for(const lane of [0,.55]){
      const {car,road}=placed(id,f,lane);
      for(let i=0;i<90;i++){
        // Hold the comparison on the same lane so curves and zone boundaries
        // cannot masquerade as a speed advantage.
        car.x=road.x+road.nx*road.halfWidth*lane;car.z=road.z+road.nz*road.halfWidth*lane;car.trackFraction=f;car.angle=road.angle;car.raceTime=seconds;
        stepCar(car,{steer:0,throttle:1,reverse:false,brake:false,nudge:0});
      }
      speeds.push(forward(car,road));
    }
    assert.ok(speeds[1]>speeds[0]*1.15,`${id}: ${speeds}`);
  }
});

test('rotating deck force is confined to the visible 24-metre disk',()=>{
  selectTrack('factory');const f=FACTORY_TABLES[0],p=trackAt(f);
  assert.equal(circuitSurface('factory',f,0,p.halfWidth,TRACK_LENGTH,0).kind,'table');
  assert.equal(circuitSurface('factory',f,24.1,p.halfWidth,TRACK_LENGTH,0).kind,'road');
  assert.equal(circuitSurface('factory',f+25/TRACK_LENGTH,0,p.halfWidth,TRACK_LENGTH,0).kind,'road');
});

test('heat builds and cools at one second per second, with exact integrated burn damage',()=>{
  const c={circuitHeat:0};let damage=0;
  damage+=advanceCircuitHeat(c,true,1);assert.equal(c.circuitHeat,1);assert.equal(damage,0);
  assert.equal(heatDamageRate(1),0);assert.ok(Math.abs(heatDamageRate(1.000001)-20/3)<.001);assert.equal(heatDamageRate(2),10);assert.equal(heatDamageRate(3),40/3);
  damage+=advanceCircuitHeat(c,true,2);assert.equal(c.circuitHeat,3);assert.ok(Math.abs(damage-20)<1e-9);
  assert.ok(Math.abs(advanceCircuitHeat(c,true,1)-40/3)<1e-9);assert.equal(c.circuitHeat,3);
  assert.ok(Math.abs(advanceCircuitHeat(c,false,2)-20)<1e-9);assert.equal(c.circuitHeat,1);
  assert.equal(advanceCircuitHeat(c,false,1),0);assert.equal(c.circuitHeat,0);
});
test('brief lane exits preserve heat and cannot reset the free second',()=>{
  const c={};advanceCircuitHeat(c,true,.99);advanceCircuitHeat(c,false,.1);const damage=advanceCircuitHeat(c,true,.2);
  assert.ok(Math.abs(c.circuitHeat-1.09)<1e-12);assert.ok(damage>.59);assert.ok(heatFlameStrength(c.circuitHeat)>0);
});
test('burn integration agrees at 30 Hz, 60 Hz and across a threshold in one large step',()=>{
  const results=[];for(const n of [1,30,60]){const c={};let damage=0;for(let i=0;i<3*n;i++)damage+=advanceCircuitHeat(c,true,1/n);for(let i=0;i<3*n;i++)damage+=advanceCircuitHeat(c,false,1/n);results.push(damage);assert.ok(c.circuitHeat<1e-12);}
  for(const damage of results)assert.ok(Math.abs(damage-40)<1e-8);
});
test('heat damage persists on ordinary stone and while airborne, and shields use existing damage rules',()=>{
  for(const airborne of [false,true]){const {car,road}=placed('volcano',.02);car.circuitHeat=2;if(airborne)car.y=road.y+2;
    stepCar(car,{steer:0,throttle:0,reverse:false,brake:false,nudge:0},.5);
    assert.equal(car.circuitHeat,1.5);assert.ok(Math.abs(car.health-(100-6.875*2/3))<1e-9);
  }
  const {car}=placed('volcano',.02);car.circuitHeat=2;car.shield=2;stepCar(car,{steer:0,throttle:0,reverse:false,brake:false,nudge:0},.5);assert.equal(car.health,100);assert.equal(car.circuitHeat,1.5);
});
test('heated prediction matches authoritative health, heat and movement during cooldown',()=>{
  const {car}=placed('volcano',.02);car.circuitHeat=2.5;const expected={...car},predicted={...car},input={steer:0,throttle:1,reverse:false,brake:false,nudge:0};
  for(let i=0;i<60;i++){stepCar(expected,input);expected.raceTime=(expected.raceTime||0)+STEP;predictFleet(predicted,[],input,STEP);}
  assert.ok(expected.health<100);assert.equal(predicted.health,expected.health);assert.equal(predicted.circuitHeat,expected.circuitHeat);assert.ok(Math.hypot(predicted.x-expected.x,predicted.z-expected.z)<1e-8);
});
test('heat is per vehicle and finished racers no longer burn',()=>{
  const a={},b={};advanceCircuitHeat(a,true,2);assert.equal(b.circuitHeat,undefined);a.finished=true;assert.equal(advanceCircuitHeat(a,false,1),0);assert.equal(a.circuitHeat,2);
});
test('long conveyors reverse smoothly every three seconds without texture jumps',()=>{
  assert.ok(FACTORY_BELTS.every(b=>b.length>=220));
  for(const [t,expected]of [[0,1],[3,1],[3.75,0],[4.5,-1],[6,-1],[6.75,0],[7.5,1],[9,1]])assert.ok(Math.abs(beltDirection(t)-expected)<1e-9);
  for(const t of [1,2,2.3,2.8,3,3.5,4,4.4,5,6,8]){const eps=1e-6;assert.ok(Math.abs((beltTravel(t+eps)-beltTravel(t-eps))/(2*eps)-beltDirection(t))<1e-5);}
});
test('eighteen staggered vents and presses repeat every three seconds with advance warnings',()=>{
  assert.equal(VOLCANO_VENTS.length,18);
  for(let i=0;i<VOLCANO_VENTS.length;i++)for(const t of [.4,1.8,2.55]){const a=ventState(t,i),b=ventState(t+3,i);assert.equal(a.active,b.active);assert.equal(a.warning,b.warning);assert.ok(Math.abs(a.power-b.power)<1e-10);}
  for(const t of [1.5,2.5]){const a=pressState(t),b=pressState(t+3);assert.equal(a.warning,b.warning);assert.equal(a.active,b.active);assert.ok(Math.abs(a.stroke-b.stroke)<1e-10);}
});

test('presses occupy the geometric inside lane, and factory outside corners have real gaps',()=>{
  selectTrack('factory');for(const f of FACTORY_PRESSES){const p=trackAt(f);assert.equal(circuitSurface('factory',f,p.insideSide*p.halfWidth*.56,p.halfWidth,TRACK_LENGTH,2.5,p.insideSide).kind,'press');assert.notEqual(circuitSurface('factory',f,-p.insideSide*p.halfWidth*.56,p.halfWidth,TRACK_LENGTH,2.5,p.insideSide).kind,'press');}
  let exposed=0;for(const p of SEGMENTS)if(Math.abs(p.turn)>.065&&!hasBarrier(p.start/TRACK_LENGTH,-p.insideSide))exposed++;assert.ok(exposed>100);
});
test('the removed water circuit cannot be selected',()=>{assert.equal(Object.keys(TRACKS).length,6);assert.throws(()=>selectTrack('ruins'));});
