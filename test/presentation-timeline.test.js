import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnCar,selectTrack,trackAt,STEP,NEUTRAL,carContact} from '../shared/game.js';
import {predictFleet} from '../shared/prediction.js';
import {RenderCorrections,renderFleet} from '../shared/netcode.js';
import {CombatPrediction} from '../shared/combat-prediction.js';
import {initCombat,giveWeapon,updateCombat} from '../shared/combat.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function car(id,side=0){const c={...spawnCar(),id,input:{...NEUTRAL},fireLatch:false},p=trackAt(.04);return Object.assign(c,{x:p.x+p.nx*side,z:p.z+p.nz*side,y:p.y,groundY:p.y,angle:p.angle,trackFraction:.04,progress:.04,vx:Math.cos(p.angle)*25,vz:Math.sin(p.angle)*25});}
function snapshot(a,b){return {phase:'racing',time:1000,startAt:0,players:[a,b],projectiles:[],effects:[],sounds:[],mines:[],chains:[],arcs:[],pulses:[]};}
test('at 200ms latency visible peers follow their collision bodies, including side contact',()=>{
 selectTrack('coast');const a=car('self',-2.4),b=car('peer',0),state=clone(snapshot(a,b));
 for(let i=0;i<12;i++)predictFleet(a,[b],{...NEUTRAL,throttle:1},STEP);
 const displayed=renderFleet(state,a,[b],new RenderCorrections(),STEP,0);
 for(const c of [a,b]){const view=displayed.find(p=>p.id===c.id);assert.equal(view.x,c.x);assert.equal(view.z,c.z);}
 assert.ok(Math.hypot(b.x-state.players[1].x,b.z-state.players[1].z)>3,'exercise a materially stale snapshot');
 assert.equal(!!carContact(...displayed),!!carContact(a,b));
});
test('all discrete weapons present immediately and keep IDs through server confirmation and replay',()=>{
 for(const weapon of ['rocket','plasma','machinegun','railgun','shotgun','pulse','shield','mine','chain']){
  selectTrack('coast');const a=car('self'),b=car('peer',8);giveWeapon(a,weapon);const original=clone(snapshot(a,b)),prediction=new CombatPrediction();prediction.reconcile(original,a,[b]);
  prediction.step({...NEUTRAL,fire:true},STEP);const visual=prediction.view();assert.ok(visual.sounds.some(s=>s.kind===weapon),weapon+' immediately audible');assert.ok(a.ammo<original.players[0].ammo,weapon+' inventory immediate');
  const serverCars=clone(original.players),room={phase:'racing',startAt:0,players:new Map(serverCars.map(c=>[c.id,{id:c.id,car:c,input:{...NEUTRAL,fire:c.id==='self'},fireLatch:false}]))};initCombat(room);updateCombat(room,STEP,1000+STEP*1000);
  for(const key of ['projectiles','mines','chains'])assert.deepEqual(visual[key].map(x=>x.id),room[key].map(x=>x.id),weapon+' '+key+' confirmed identity');
  for(const event of visual.effects)assert.ok(room.effects.some(e=>e.id===event.id),weapon+' effect identity');
  assert.equal(visual.sounds[0].id,room.sounds[0].id,weapon+' sound not replayed');
  const confirmed={...original,time:1000+STEP*1000,...Object.fromEntries(['projectiles','effects','sounds','mines','chains','arcs','pulses'].map(k=>[k,clone(room[k])]))};
  const local=clone(serverCars[0]),peer=clone(serverCars[1]);local.fireLatch=true;prediction.reconcile(confirmed,local,[peer]);prediction.step({...NEUTRAL,fire:true},STEP);
  assert.equal(local.weaponShot,1,weapon+' held confirmation cannot double fire');

 }
});
test('predicted weapons never apply damage or impulses to the opponent',()=>{
 selectTrack('coast');const a=car('self'),b=car('peer');b.x+=Math.cos(a.angle)*10;b.z+=Math.sin(a.angle)*10;giveWeapon(a,'railgun');const before=clone(b),prediction=new CombatPrediction();prediction.reconcile(snapshot(a,b),a,[b]);prediction.step({...NEUTRAL,fire:true},STEP);
 assert.equal(b.health,before.health);assert.equal(b.vx,before.vx);assert.equal(b.vz,before.vz);assert.equal(b.vy,before.vy);assert.equal(b.eliminated,false);
});
test('a rejected prediction restores inventory and removes speculative projectiles',()=>{
 selectTrack('coast');const a=car('self'),b=car('peer',9);giveWeapon(a,'rocket');const authority=clone(snapshot(a,b)),p=new CombatPrediction();p.reconcile(authority,a,[b]);p.step({...NEUTRAL,fire:true},STEP);assert.equal(p.view().projectiles.length,1);
 const restored=clone(authority.players);p.reconcile({...authority,time:1050},restored[0],[restored[1]]);assert.equal(p.view().projectiles.length,0);assert.equal(restored[0].item,'rocket');assert.equal(restored[0].ammo,1);
});
test('flame and taser activate immediately, preserve peer arcs, and consume fuel only while held',()=>{
 for(const weapon of ['flame','taser']){selectTrack('coast');const a=car('self'),b=car('peer',5);giveWeapon(a,weapon);const initialAmmo=a.ammo,state=snapshot(a,b);state.arcs=[{owner:'peer',target:'self'}];const p=new CombatPrediction();p.reconcile(state,a,[b]);p.step({...NEUTRAL,fire:true},STEP);assert.equal(a.firing,weapon);assert.ok(Math.abs(a.ammo-(initialAmmo-STEP))<1e-8);const remaining=a.ammo;p.step(NEUTRAL,STEP);assert.equal(a.ammo,remaining);assert.equal(a.firing,null);assert.ok(p.view().arcs.some(x=>x.owner==='peer'));assert.equal(b.health,100);}
});
