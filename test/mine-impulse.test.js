import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnCar,trackAt,selectTrack,STEP,NEUTRAL,stepCar,mineImpulse} from '../shared/game.js';
import {initCombat,updateCombat} from '../shared/combat.js';
const car=()=>{selectTrack('coast');const p=trackAt(.025);return {...spawnCar(),x:p.x,z:p.z,angle:p.angle,trackFraction:.025};};
function flight(hits,side=.7,fore=-1){const c=car();let height=0,spin=0;for(let i=0;i<160;i++){if(i%6===0&&i/6<hits)mineImpulse(c,side,fore);stepCar(c,NEUTRAL);height=Math.max(height,c.y);spin=Math.max(spin,Math.abs(c.roll)+Math.abs(c.pitch));}return {c,height,spin};}
test('a single mine hops modestly; repeated impulses build height and rotation',()=>{
  const a=flight(1),b=flight(2),c=flight(3);assert.ok(a.height>.4&&a.height<.9);assert.equal(a.c.overturned,false);assert.ok(b.height>a.height*2);assert.ok(c.height>b.height*1.5);assert.ok(c.spin>b.spin&&b.spin>a.spin);
  assert.equal(flight(3,.5,1).c.overturned,true,'off-centre chain can flip the car');
});
test('mine impulse adds to signed vertical momentum and shields block it',()=>{
  const c=car();c.vy=-2;mineImpulse(c);assert.ok(Math.abs(c.vy-3.2)<1e-9);c.shield=1;const before=structuredClone(c);mineImpulse(c,1,1);assert.deepEqual(c,before);
});
test('physical mine clusters stay grounded at full health and build height as damage accumulates',()=>{
  const heights=[];
  for(const count of [1,2,3]){
    const c=car(),p={id:'target',car:c,input:{...NEUTRAL}},r={players:new Map([[p.id,p]]),phase:'racing',startAt:0};initCombat(r);
    const dx=Math.cos(c.angle),dz=Math.sin(c.angle);c.vx=dx*30;c.vz=dz*30;
    r.mines=Array.from({length:count},(_,id)=>({id,x:c.x+dx*id*3,z:c.z+dz*id*3,y:0,angle:c.angle,pitch:0,armAt:0,until:10000}));let height=0;
    for(let i=0;i<100;i++){updateCombat(r,STEP,i*STEP*1000);stepCar(c,NEUTRAL);height=Math.max(height,c.y);}
    assert.equal(r.mines.length,0);assert.equal(c.health,100-count*28);assert.equal(c.falling,false);heights.push(height);
  }
  assert.equal(heights[0],0);assert.ok(heights[1]>.05);assert.ok(heights[2]>.5&&heights[2]>heights[1]*3);
});
test('upright single-mine landing preserves forward momentum',()=>{
  const c=car();c.vx=20*Math.cos(c.angle);c.vz=20*Math.sin(c.angle);mineImpulse(c);let airborne=false;
  for(let i=0;i<90;i++){stepCar(c,NEUTRAL);airborne ||= c.y>.2;if(airborne&&c.y<=c.groundY+.001)break;}
  assert.ok(Math.hypot(c.vx,c.vz)>15);assert.equal(c.overturned,false);
});
