import test from 'node:test';
import assert from 'node:assert/strict';
import {createNudgeEffects} from '../public/nudge-effects.js';
import {selectTrack,spawnCar,trackAt,STEP,NEUTRAL,stepCar,roadSurfaceAt} from '../shared/game.js';
function fixture(track='coast',fraction=.025){selectTrack(track);const at=trackAt(fraction),car={...spawnCar(),id:'test',x:at.x,z:at.z,y:at.y,groundY:at.y,angle:at.angle,trackFraction:fraction};return {car,effects:createNudgeEffects()};}
function dispose(effects){for(const mesh of [effects.skids,effects.streaks]){mesh.geometry.dispose();mesh.material.dispose();}}
test('actual left and right nudges leave four tyre tracks and motion streaks trailing the shove',()=>{
  for(const direction of [-1,1]){
    const {car,effects}=fixture();effects.update(0,[car]);assert.equal(effects.skids.visible,false);assert.equal(effects.streaks.visible,false);
    const before={...car};stepCar(car,{...NEUTRAL,nudge:direction},STEP);effects.update(STEP,[car]);
    assert.equal(effects.skids.geometry.drawRange.count,24);assert.equal(effects.streaks.geometry.drawRange.count,30);
    const nx=-Math.sin(car.nudgeAngle)*direction,nz=Math.cos(car.nudgeAngle)*direction,p=effects.streaks.geometry.attributes.position;
    let mean=0;for(let i=0;i<p.count&&i<30;i++)mean+=(p.getX(i)-car.x)*nx+(p.getZ(i)-car.z)*nz;
    assert.ok(mean/30<-.8,'motion streaks trail the actual nudge direction');
    const marks=effects.skids.geometry.attributes.position;let min=Infinity,max=-Infinity;
    for(let i=0;i<24;i++){const forward=(marks.getX(i)-before.x)*Math.cos(car.angle)+(marks.getZ(i)-before.z)*Math.sin(car.angle);min=Math.min(min,forward);max=Math.max(max,forward);}
    assert.ok(max-min>2.5,'front and rear tyres both leave marks');
    for(let i=2;i<=12;i++){stepCar(car,NEUTRAL,STEP);effects.update(i*STEP,[car]);}
    assert.ok(effects.skids.geometry.drawRange.count>=24);effects.update(.4,[car]);assert.equal(effects.streaks.visible,false);assert.equal(effects.skids.visible,true);
    effects.update(2.2,[car]);assert.equal(effects.skids.visible,false);dispose(effects);
  }
});
test('stationary steering, failed/airborne nudges and cooldown corrections do not create extra bursts',()=>{
  const {car,effects}=fixture();effects.update(0,[car]);stepCar(car,{...NEUTRAL,steer:1},STEP);effects.update(STEP,[car]);assert.equal(effects.streaks.visible,false);
  stepCar(car,{...NEUTRAL,nudge:1},STEP);effects.update(STEP*2,[car]);const born=effects.streaks.geometry.attributes.born.getX(0);
  effects.update(.08,[{...car,nudgeCooldown:.79}]);assert.equal(effects.streaks.geometry.attributes.born.getX(0),born,'reconciliation does not retrigger');
  for(const flag of ['eliminated','finished','falling','overturned','wrecked']){effects.reset();effects.update(0,[{...car,[flag]:true}]);assert.equal(effects.streaks.visible,false);assert.equal(effects.skids.visible,false);}
  effects.reset();effects.update(0,[{...car,y:car.groundY+5}]);assert.equal(effects.streaks.visible,false);dispose(effects);
});
test('tyre marks follow desert grades and their own bridge deck and skip ice gaps',()=>{
  for(const [track,fraction]of [['desert',.25],['desert',.5],['ice',.025]]){
    const {car,effects}=fixture(track,fraction);effects.update(0,[car]);stepCar(car,{...NEUTRAL,nudge:1},STEP);effects.update(STEP,[car]);const vertices=effects.skids.geometry.attributes.position;
    assert.ok(effects.skids.geometry.drawRange.count>0);
    for(let i=0;i<effects.skids.geometry.drawRange.count;i++){const road=roadSurfaceAt(vertices.getX(i),vertices.getZ(i),car.trackFraction);assert.ok(road);assert.ok(Math.abs(vertices.getY(i)-road.y-.045)<.005);}
    dispose(effects);
  }
});
test('skid marks never bridge the ice crevasse',()=>{
  const {car,effects}=fixture('ice');Object.assign(car,{x:0,z:-40,y:0,groundY:0,angle:0});effects.update(0,[car]);
  Object.assign(car,{z:-39.65,nudgeCooldown:.78,nudgeTime:.08,nudgeMoved:true,nudgeAngle:0,nudgeDirection:1});effects.update(STEP,[car]);
  assert.equal(effects.skids.geometry.drawRange.count,0);dispose(effects);
});
test('effect storage stays bounded and is cleared between rounds',()=>{
  const {car,effects}=fixture();const skidBuffer=effects.skids.geometry.attributes.position.array,streakBuffer=effects.streaks.geometry.attributes.position.array;
  for(let n=0;n<60;n++){effects.update(n,[{...car,nudgeCooldown:0,nudgeTime:0}]);for(let i=1;i<=6;i++)effects.update(n+i/60,[{...car,z:car.z+i*.3,nudgeCooldown:.8-i/60,nudgeTime:.1-i/60,nudgeMoved:true,nudgeAngle:0,nudgeDirection:1}]);}
  assert.ok(effects.skids.geometry.drawRange.count<=512*6);assert.equal(effects.skids.geometry.attributes.position.array,skidBuffer);assert.equal(effects.streaks.geometry.attributes.position.array,streakBuffer);
  effects.reset();assert.equal(effects.skids.geometry.drawRange.count,0);assert.equal(effects.streaks.geometry.drawRange.count,0);assert.equal(effects.group.children.length,2);dispose(effects);
});
