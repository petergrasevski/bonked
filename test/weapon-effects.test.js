import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WeaponEffects,WEAPON_EFFECT_LIMITS,createWeaponShieldMaterial,tracerHalfWidth} from '../public/weapon-effects.js';
import {CAR_LENGTH} from '../shared/game.js';
import {SkyBeamView,createSkyStrike} from '../public/sky-beam.js';
import {createFlamethrower,createFlamethrowerMaterial} from '../public/flamethrower.js';
import {FLAME_RANGE} from '../shared/combat.js';

const camera=()=>{const c=new THREE.PerspectiveCamera();c.position.set(-20,25,20);c.lookAt(0,0,0);c.updateMatrixWorld();return c;};
const state=(effects=[])=>({phase:'racing',code:'FX',round:1,trackId:'coast',time:1000,combatTime:1000,players:[],projectiles:[],mines:[],chains:[],arcs:[],effects});
const update=(view,s,dt=1/60,objects={})=>view.update(s,objects.cars||new Map(),objects.rockets||new Map(),objects.mines||new Map(),objects.chains||new Map(),camera(),dt,1000);

test('flamethrower stays attached to the rear of a moving, turning car without leaving detached fire',()=>{
  const material=createFlamethrowerMaterial(),jet=createFlamethrower(material),car=new THREE.Group(),view=new WeaponEffects(new THREE.Scene()),s=state();
  car.add(jet);jet.visible=true;const cars=new Map([['driver',car]]);s.players=[{id:'driver',firing:'flame',vx:36,vz:0}];
  const bounds=new THREE.Box3().setFromObject(jet);
  assert.ok(Math.abs(bounds.min.x+FLAME_RANGE)<1e-6);assert.ok(Math.abs(bounds.max.x+CAR_LENGTH/2)<1e-6);
  for(let frame=0;frame<60;frame++){
    car.position.set(frame*.6,4,frame*.2);car.rotation.y=frame*.03;car.updateMatrixWorld(true);
    update(view,s,1/30,{cars});
    const rear=car.localToWorld(new THREE.Vector3(-CAR_LENGTH/2,.9,0));assert.ok(jet.getWorldPosition(new THREE.Vector3()).distanceTo(rear)<1e-8);
    assert.equal(view.particles.length,0,'flame remains attached rather than leaving detached particles');
  }
  jet.children[0].geometry.dispose();material.dispose();view.dispose();
});

test('pitched rail ribbons preserve both authoritative beam endpoints on elevated roads',()=>{
  const scene=new THREE.Scene(),view=new WeaponEffects(scene),s=state([{id:'rail',kind:'rail',x:12,y:37,z:8,toX:62,toY:52,toZ:18,duration:1800,until:2800,color:'#98ecff'}]),before=structuredClone(s);
  update(view,s);const p=view.lines.geometry.attributes.position;
  assert.ok(view.lines.geometry.drawRange.count>100);
  // Each ribbon edge is offset symmetrically around the world-space centreline.
  for(const [vertex,expected]of [[0,[12,37,8]],[2,[62,52,18]]]){
    const opposite=vertex===0?1:4;
    for(const [axis,get]of ['getX','getY','getZ'].entries())assert.ok(Math.abs((p[get](vertex)+p[get](opposite))/2-expected[axis])<1e-5);
  }
  assert.deepEqual(s,before,'effects must never write into the network state');view.dispose();
});
test('confirmed projectile hits flash the rendered target and keep contact feedback attached through motion',()=>{
  for(const weapon of ['machinegun','plasma']){
    const view=new WeaponEffects(new THREE.Scene()),car=new THREE.Group();car.userData.paint=new THREE.MeshStandardMaterial();
    car.position.set(20,8,10);car.rotation.set(.1,.5,.2);car.updateMatrixWorld();
    const cars=new Map([['target',car]]),s=state([{id:'hit',kind:'projectile-hit',weapon,target:'target',x:-100,y:0,z:-100,localX:-CAR_LENGTH/2-.1,localY:.9,localZ:0,duration:220,until:1220,color:weapon==='plasma'?'#63dfff':'#ffcb65'}]);
    const before=structuredClone(s),point=car.localToWorld(new THREE.Vector3(-CAR_LENGTH/2-.1,.9,0));
    update(view,s,0,{cars});assert.equal(view.particles.length,11);assert.ok(view.particles.every(p=>Math.hypot(p.x-point.x,p.y-point.y,p.z-point.z)<1e-7));
    assert.ok(car.userData.paint.emissiveIntensity>=1);assert.equal(view.lines.geometry.drawRange.count,96);
    car.position.x+=30;car.rotation.y+=.4;car.updateMatrixWorld();car.userData.paint.emissiveIntensity=0;
    update(view,s,.05,{cars});assert.equal(view.particles.length,11,'replayed confirmations do not duplicate sparks');assert.ok(car.userData.paint.emissiveIntensity>0);
    const contact=car.localToWorld(new THREE.Vector3(-CAR_LENGTH/2-.1,.9,0)),positions=view.lines.geometry.attributes.position;
    // First ribbon follows the new target pose, rather than the old network position.
    const start=new THREE.Vector3((positions.getX(0)+positions.getX(1))/2,(positions.getY(0)+positions.getY(1))/2,(positions.getZ(0)+positions.getZ(1))/2);
    assert.ok(start.distanceTo(contact)<1);
    for(let i=0;i<5;i++){car.userData.paint.emissiveIntensity=0;update(view,s,.05,{cars});}
    assert.equal(car.userData.paint.emissiveIntensity,0);assert.equal(view.events.length,0);assert.deepEqual(s,before);
    car.userData.paint.dispose();view.dispose();
  }
});

test('replayed effect packets emit once, stale effects stay expired, and a new round accepts reused IDs',()=>{
  const view=new WeaponEffects(new THREE.Scene()),s=state([{id:1,kind:'explosion',x:0,y:8,z:0,duration:650,until:1650}]);
  update(view,s);const count=view.particles.length;update(view,s);assert.equal(view.particles.length,count);assert.equal(view.events.length,1);
  for(let i=0;i<100;i++)update(view,s,.05);
  assert.equal(view.events.length,0);assert.equal(view.particles.length,0);update(view,s);assert.equal(view.events.length,0);
  s.round=2;update(view,s);assert.equal(view.events.length,1);assert.ok(view.particles.length>0);
  update(view,{...s,phase:'lobby'});assert.equal(view.events.length,0);assert.equal(view.glow.count,0);assert.equal(view.lines.geometry.drawRange.count,0);view.dispose();
});

test('all projectile and continuous weapon visuals consume smoothed world poses without moving game objects',()=>{
  const view=new WeaponEffects(new THREE.Scene()),s=state(),objects={cars:new Map(),rockets:new Map(),mines:new Map(),chains:new Map()};
  for(const [i,kind]of ['rocket','plasma','machinegun'].entries()){
    const g=new THREE.Group();g.position.set(20+i*10,15+i,30);g.rotation.set(.1,.2,.3);objects.rockets.set(i,g);s.projectiles.push({id:i,kind,owner:'driver',x:0,y:0,z:0});
  }
  for(const [i,firing]of ['flame','taser'].entries()){
    const g=new THREE.Group();g.position.set(i*5,15,0);objects.cars.set(i,g);s.players.push({id:i,firing,groundY:15});
  }
  s.arcs=[{owner:1,target:0}];const mine=new THREE.Group();mine.position.set(0,20,0);objects.mines.set('mine',mine);s.mines=[{id:'mine',armAt:900}];
  const chain=new THREE.Group(),ball=new THREE.Mesh();ball.position.set(4,21,4);chain.add(ball);objects.chains.set('chain',chain);s.chains=[{id:'chain',vx:20,vz:10}];
  const poses=[...objects.rockets.values(),...objects.cars.values(),mine,ball].map(g=>g.position.toArray()),before=structuredClone(s);
  update(view,s,.04,objects);
  assert.ok(view.glow.count>0);assert.ok(view.smoke.count>0);assert.ok(view.rings.count>=2);assert.ok(view.lines.geometry.drawRange.count>0);
  assert.ok(view.particles.some(p=>p.x>29&&p.y>15),'plasma follows its rendered pose, not stale network coordinates');
  assert.ok(view.particles.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));
  assert.deepEqual([...objects.rockets.values(),...objects.cars.values(),mine,ball].map(g=>g.position.toArray()),poses);assert.deepEqual(s,before);view.dispose();
});

test('burst storms remain within fixed GPU buffers and disposal releases each owned resource',()=>{
  const scene=new THREE.Scene(),view=new WeaponEffects(scene),s=state(Array.from({length:400},(_,id)=>({id,kind:id%2?'rail':'explosion',x:0,y:10,z:0,toX:id%2?150:undefined,toY:15,toZ:10,until:1800,duration:800})));
  const resources=view.group.children.flatMap(m=>[m.geometry,m.material,...(m.isInstancedMesh?[m]:[])]);let disposed=0;for(const r of resources)r.addEventListener('dispose',()=>disposed++);
  update(view,s,.04);assert.ok(view.particles.length<=WEAPON_EFFECT_LIMITS.particles);assert.ok(view.events.length<=WEAPON_EFFECT_LIMITS.events);assert.ok(view.lines.geometry.drawRange.count<=WEAPON_EFFECT_LIMITS.segments*6);assert.ok(view.rings.count<=WEAPON_EFFECT_LIMITS.rings);
  view.dispose();assert.equal(disposed,resources.length);assert.equal(scene.children.length,0);
});

test('shield has animated view-dependent energy and sky strikes clean up their layered resources at impact',()=>{
  const shield=createWeaponShieldMaterial();assert.ok(shield.uniforms.time);assert.equal(shield.depthWrite,false);shield.dispose();
  const bolt=createSkyStrike('#55ddff');assert.equal(bolt.children.length,7);assert.ok(bolt.children.some(o=>o.isLine));for(const child of bolt.children){child.geometry.dispose();child.material.dispose();}
  const scene=new THREE.Scene(),view=new SkyBeamView(scene),s={...state(),skyBeams:[{id:1,at:1000,impactAt:1600,x:4,y:20,z:8,color:'#55ddff'}]};
  view.update(s,'me',camera(),{}, {x:0,y:0},1/60);const strike=view.beams.get(1);assert.equal(strike.position.y,106);let disposed=0;strike.traverse(o=>o.geometry?.addEventListener('dispose',()=>disposed++));
  s.time=s.combatTime=1600;view.update(s,'me',camera(),{}, {x:0,y:0},1/60);assert.equal(view.beams.size,0);assert.equal(disposed,7);assert.equal(scene.children.length,0);
});


test('effect expiry uses the predicted combat clock and falls back to snapshot time',()=>{
  const view=new WeaponEffects(new THREE.Scene()),s=state([
    {id:'expired',kind:'pulse',x:0,y:0,z:0,duration:650,until:1400},
    {id:'active',kind:'pulse',x:0,y:0,z:0,duration:1000,until:1800},
  ]);s.combatTime=1500;
  update(view,s,0);assert.deepEqual(view.events.map(e=>e.id),['active']);assert.ok(Math.abs(view.events[0].age-.7)<1e-9);
  view.reset();delete s.combatTime;update(view,s,0);assert.equal(view.events.length,2);assert.ok(Math.abs(view.events.find(e=>e.id==='active').age-.2)<1e-9);view.dispose();
});


test('machinegun first-frame tracers bridge the muzzle gap and scale with camera distance',()=>{
  const view=new WeaponEffects(new THREE.Scene()),s=state(),car=new THREE.Group(),bullet=new THREE.Group(),cam=camera();
  car.position.set(10,4,20);car.rotation.y=-Math.PI/2;car.updateMatrixWorld();
  bullet.position.copy(car.localToWorld(new THREE.Vector3(24,.9,0)));bullet.quaternion.copy(car.quaternion);
  s.projectiles=[{id:'bullet',kind:'machinegun',owner:'driver'}];
  view.update(s,new Map([['driver',car]]),new Map([['bullet',bullet]]),new Map(),new Map(),cam,0,1000,900);
  const positions=view.lines.geometry.attributes.position,muzzle=car.localToWorld(new THREE.Vector3(CAR_LENGTH/2+.5,.9,0));
  for(const [axis,get]of ['getX','getY','getZ'].entries())assert.ok(Math.abs((positions[get](0)+positions[get](1))/2-muzzle.getComponent(axis))<1e-5);
  assert.equal(view.lines.geometry.drawRange.count,12,'muzzle-to-bullet segment and bright bullet core appear immediately');
  const point=new THREE.Vector3();cam.position.set(0,0,80);const near=tracerHalfWidth(cam,point,900);cam.position.z=200;const far=tracerHalfWidth(cam,point,900);
  assert.ok(far>near*2);assert.ok(Math.abs(far/near-2.5)<1e-8,'zoom retains a consistent apparent width');
  assert.ok(tracerHalfWidth(cam,point,450)>far,'lower viewport resolution stays readable');view.dispose();
});
test('scrape sparks originate at rendered body contacts and stop after separation',()=>{
  const view=new WeaponEffects(new THREE.Scene()),s=state(),car=new THREE.Group();car.position.set(10,6,20);car.rotation.y=-Math.PI/2;car.updateMatrixWorld();
  s.players=[{id:'driver',vx:30,vz:0,contactTime:.14,contact:{x:1,y:.6,z:1,nx:0,nz:1,speed:30,kind:'wall'}}];
  const origin=car.localToWorld(new THREE.Vector3(1,.6,1)),before=structuredClone(s);
  update(view,s,.04,{cars:new Map([['driver',car]])});const sparks=view.particles.filter(p=>p.streak);assert.equal(sparks.length,5);
  for(const p of sparks){assert.ok(Math.hypot(p.x-p.vx*.04-origin.x,p.y-p.vy*.04-origin.y,p.z-p.vz*.04-origin.z)<1e-7);assert.ok(p.size>=.18);}
  assert.deepEqual(s,before,'cosmetic effects cannot write into authoritative contacts');s.players[0].contactTime=0;
  for(let i=0;i<20;i++)update(view,s,.05,{cars:new Map([['driver',car]])});assert.equal(view.particles.length,0);view.dispose();
});
