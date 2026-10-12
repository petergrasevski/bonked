import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Euler} from 'three';
import {selectTrack,trackAt,nearestTrack,TRACK_LENGTH,spawnCar,NEUTRAL,STEP,stepCar,hasBarrier} from '../shared/game.js';
import {initCombat,giveWeapon,pressWeapon,updateCombat,DAMAGE} from '../shared/combat.js';
import {weaponBasis,weaponMuzzle,weaponDirection,rayCar3D,sweepTrackWalls} from '../shared/weapon-geometry.js';
import {projectilePose} from '../public/projectile-motion.js';
function player(id,f,progress=f){const p=trackAt(f);return {id,car:{...spawnCar(),...p,trackFraction:f,progress,groundY:p.y,pitch:Math.atan(p.grade)},input:{...NEUTRAL}};}
function room(...ps){const r={phase:'racing',startAt:0,players:new Map(ps.map(p=>[p.id,p]))};initCombat(r);return r;}
function fire(r,p,kind){giveWeapon(p.car,kind);assert.equal(pressWeapon(r,p,0),true);}

test('weapon basis and muzzle match the rendered YXZ car transform, including roll',()=>{
  const c={x:7,y:20,z:-4,angle:.7,pitch:.32,roll:-.44},basis=weaponBasis(c),rotation=new Euler(c.roll,-c.angle,c.pitch,'YXZ');
  for(const [key,v]of [['forward',[1,0,0]],['up',[0,1,0]],['side',[0,0,1]]]){
    const transformed=new Vector3(...v).applyEuler(rotation);assert.ok(transformed.distanceTo(new Vector3(...Object.values(basis[key])))<1e-12);
  }
  const muzzle=weaponMuzzle(c),expected=new Vector3(2.95,.9,0).applyEuler(rotation).add(new Vector3(c.x,c.y+(1-Math.cos(c.roll)*Math.cos(c.pitch))*.5,c.z));
  assert.ok(expected.distanceTo(new Vector3(muzzle.x,muzzle.y,muzzle.z))<1e-12);
  assert.ok(weaponDirection(c,Math.PI/2).y>0,'banking tilts the side-mounted shotgun direction');
});

test('grounded cars aim along the real desert grade; airborne rotation remains ballistic',()=>{
  selectTrack('desert');const c=player('a',.88).car;
  c.pitch=0;for(let i=0;i<60;i++)stepCar(c,NEUTRAL);
  assert.ok(c.pitch>.09);c.angle+=Math.PI;for(let i=0;i<60;i++)stepCar(c,NEUTRAL);assert.ok(c.pitch<-.09);
  Object.assign(c,{y:c.groundY+5,vy:2,pitch:.7,pitchVelocity:.2});stepCar(c,NEUTRAL);assert.ok(c.pitch>.7,'launch pitch must not be flattened to the ground normal');
});

test('railgun aims up and down real desert slopes and sends both endpoint heights',()=>{
  selectTrack('desert');
  for(const f of [.07,.88]){
    const a=player('a',f),b=player('b',f+20/TRACK_LENGTH),r=room(a,b);fire(r,a,'railgun');
    assert.equal(b.car.health,100-DAMAGE.railgun);const beam=r.effects.find(e=>e.kind==='rail');
    assert.ok(Math.abs(beam.toY-beam.y)>8);assert.equal(Math.sign(beam.toY-beam.y),Math.sign(a.car.pitch));
  }
});

test('inclined plasma and machine-gun sweeps hit at the intersection height, not launch height',()=>{
  selectTrack('desert');
  for(const kind of ['plasma','machinegun']){
    const a=player('a',.88),m=weaponMuzzle(a.car),d=weaponDirection(a.car),b=player('b',.88),under=player('under',.88);
    Object.assign(b.car,{x:m.x+d.x*18,y:m.y+d.y*18-.7,z:m.z+d.z*18,angle:a.car.angle,pitch:0});
    Object.assign(under.car,{x:b.car.x,y:b.car.y-8,z:b.car.z,angle:b.car.angle,pitch:0});
    const r=room(a,b,under);fire(r,a,kind);const shot=r.projectiles[0];assert.ok(shot.vy>0);assert.ok(shot.y>a.car.y+.9);
    for(let i=1;i<=30&&r.projectiles.length;i++)updateCombat(r,STEP,i*STEP*1000);
    assert.equal(b.car.health,100-DAMAGE[kind]);assert.equal(under.car.health,100);
    if(kind==='machinegun')assert.ok(r.effects.some(e=>e.kind==='tracer'&&e.toY>e.y));
  }
});

test('3D ray avoids a stacked car on the other desert bridge deck',()=>{
  selectTrack('desert');const lower=player('low',.5).car,upper=player('high',0).car;
  const start={x:lower.x-10,y:lower.y+.8,z:lower.z},delta={x:20,y:0,z:0};
  assert.notEqual(rayCar3D(start,delta,lower),null);assert.equal(rayCar3D(start,delta,upper),null);
  assert.notEqual(rayCar3D({...start,y:20.8},delta,upper),null);assert.equal(rayCar3D({...start,y:20.8},delta,lower),null);
});

test('rockets follow each figure-eight route through the crossing and hit the next car on that deck',()=>{
  selectTrack('desert');
  for(const [from,to,otherFraction]of [[.49,.53,0],[.99,1.03,.5]]){
    const a=player('a',from),b=player('b',to%1,to),other=player('other',otherFraction,to+1),r=room(a,b,other);fire(r,a,'rocket');
    assert.equal(r.projectiles[0].target,'b');let crossed=false;
    for(let i=1;i<=200&&r.projectiles.length;i++){
      updateCombat(r,STEP,i*STEP*1000);const shot=r.projectiles[0];if(!shot)break;
      const t=nearestTrack(shot.x,shot.z,shot.trackFraction);assert.ok(t.distance<1);assert.ok(shot.y>=t.y+.89);
      if(Math.hypot(shot.x,shot.z)<8){crossed=true;if(from<.5)assert.ok(shot.y<2);else assert.ok(shot.y>20);}
    }
    assert.equal(crossed,true);assert.equal(b.car.health,58);assert.equal(other.car.health,100);
  }
});

test('rockets stay above steep uphill and downhill desert road without cutting across bends',()=>{
  selectTrack('desert');
  for(const [from,to]of [[.12,.20],[.82,.90]]){
    const a=player('a',from),b=player('b',to),r=room(a,b);fire(r,a,'rocket');
    for(let i=1;i<=240&&r.projectiles.length;i++){
      updateCombat(r,STEP,i*STEP*1000);const shot=r.projectiles[0];if(!shot)break;
      const road=nearestTrack(shot.x,shot.z,shot.trackFraction);
      assert.ok(shot.y>=road.y+.89);assert.ok(road.distance<2,'rocket stays on its own curving route');
    }
    assert.equal(b.car.health,58);
  }
});

test('rocket terrain following stays above the desert jump and continues over its launch edge',()=>{
  selectTrack('desert');const a=player('a',.21),b=player('b',.26),r=room(a,b);fire(r,a,'rocket');let airborne=false;
  for(let i=1;i<=220&&r.projectiles.length;i++){
    updateCombat(r,STEP,i*STEP*1000);const shot=r.projectiles[0];if(!shot)break;
    const floor=nearestTrack(shot.x,shot.z,shot.trackFraction).y;
    assert.ok(shot.y>=floor+.89);if(shot.y>floor+1.5)airborne=true;
  }
  assert.equal(airborne,true);assert.equal(b.car.health,58);
});

test('continuous rocket wall sweeps detect outer and ice inner barriers without hitting another elevation',()=>{
  selectTrack('desert');const p=trackAt(.05),origin={x:p.x,y:p.y+.9,z:p.z},delta={x:p.nx*40,y:0,z:p.nz*40};
  assert.equal(hasBarrier(.05),true);const t=sweepTrackWalls(origin,delta);assert.ok(t>0&&t<1);
  assert.equal(sweepTrackWalls({...origin,y:p.y+10},delta),null);
  selectTrack('ice');
  assert.notEqual(sweepTrackWalls({x:0,y:.9,z:-31},{x:0,y:0,z:-18}),null,'sweep crosses the guarded gap edge');
  assert.equal(sweepTrackWalls({x:80,y:.9,z:-34},{x:0,y:0,z:-12}),null,'bare gap edges remain unguarded');
  const route=nearestTrack(0,-40),a=player('a',route.fraction);Object.assign(a.car,{x:0,z:-31,angle:-Math.PI/2,pitch:0});const r=room(a);fire(r,a,'rocket');assert.equal(r.projectiles.length,1);
  updateCombat(r,.2,200);assert.equal(r.projectiles.length,0,'large step cannot tunnel through inner bumper');
  const explosion=r.effects.find(e=>e.kind==='explosion');assert.ok(explosion&&explosion.y>.5);assert.ok(explosion.z>-36);
});

test('inclined projectile prediction advances elevation at every display frame and freezes when stale',()=>{
  let pose=null,shot={x:0,y:3,z:0,angle:0,pitch:Math.atan2(12,50),speed:Math.hypot(50,12),vx:50,vy:12,vz:0},stamp=0,next=50;
  for(let now=0;now<=500;now+=1000/120){if(now>=next){stamp=next;shot={...shot,x:next*.05,y:3+next*.012};next+=50;}const prior=pose;pose=projectilePose(pose,shot,stamp,1/120,now);if(prior)assert.ok(pose.y>prior.y);}
  for(let now=510;now<2000;now+=10)pose=projectilePose(pose,shot,stamp,.01,now);
  assert.ok(Math.abs(pose.y-(shot.y+1.8))<.01);
});
