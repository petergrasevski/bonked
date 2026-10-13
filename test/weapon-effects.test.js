import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WeaponEffects,WEAPON_EFFECT_LIMITS,createWeaponShieldMaterial} from '../public/weapon-effects.js';
import {SkyBeamView,createSkyStrike} from '../public/sky-beam.js';

const camera=()=>{const c=new THREE.PerspectiveCamera();c.position.set(-20,25,20);c.lookAt(0,0,0);c.updateMatrixWorld();return c;};
const state=(effects=[])=>({phase:'racing',code:'FX',round:1,trackId:'coast',time:1000,combatTime:1000,players:[],projectiles:[],mines:[],chains:[],arcs:[],effects});
const update=(view,s,dt=1/60,objects={})=>view.update(s,objects.cars||new Map(),objects.rockets||new Map(),objects.mines||new Map(),objects.chains||new Map(),camera(),dt,1000);

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
