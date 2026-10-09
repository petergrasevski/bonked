import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPickupModel} from '../public/pickups.js';
import {createPickups,collectPickup,WEAPON_IDS,WEAPONS} from '../shared/combat.js';
import {spawnCar} from '../shared/game.js';
test('every advertised weapon awards exactly that item and its ammunition',()=>{
  for(const item of WEAPON_IDS){const car={...spawnCar(),x:0,z:0},pickup={id:0,item,x:0,z:0,readyAt:0};assert.equal(collectPickup(car,[pickup],1000,()=>.1),pickup);assert.equal(car.item,item);assert.equal(car.ammo,WEAPONS[item].ammo);assert.equal(pickup.readyAt,7000);assert.equal(pickup.item,'rocket');}
});
test('pickups have a visible type before collection; cooldown prevents a second driver collecting',()=>{
  const pickups=createPickups(()=>.95);assert.ok(pickups.every(p=>p.item==='shotgun'));const p=pickups[0],a={...spawnCar(),x:p.x,z:p.z},b={...a};collectPickup(a,pickups,2000,()=>0);assert.equal(a.item,'shotgun');assert.equal(p.item,'pulse');assert.equal(collectPickup(b,pickups,7999),null);collectPickup(b,pickups,8000);assert.equal(b.item,'pulse');
});
test('dead, airborne, occupied or overturned cars cannot consume pickups',()=>{
  for(const change of [{eliminated:true},{y:2},{item:'shield'},{overturned:true},{falling:true}]){const car={...spawnCar(),x:0,z:0,...change},p={id:0,item:'railgun',x:0,z:0,readyAt:0};assert.equal(collectPickup(car,[p],1000),null);assert.equal(p.readyAt,0);}
});
test('all ten pickup models have finite, visible 3D geometry and independent transforms',()=>{
  const signatures=new Set();for(const item of WEAPON_IDS){const model=createPickupModel(item),other=createPickupModel(item);assert.notEqual(model,other);model.rotation.y=1;assert.equal(other.rotation.y,0);let vertices=0;model.traverse(o=>{if(o.isMesh){vertices+=o.geometry.attributes.position.count;for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));}});assert.ok(vertices>100);const size=new THREE.Box3().setFromObject(other).getSize(new THREE.Vector3());assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-3.3)<.001);assert.ok(Math.min(size.x,size.y,size.z)>.1);signatures.add(`${model.children.length}:${vertices}`);}assert.equal(signatures.size,10);
});
