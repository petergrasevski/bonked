import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCarWeaponModel,syncCarWeapon} from '../public/car-weapons.js';
import {WEAPON_IDS,giveWeapon,pressWeapon,initCombat} from '../shared/combat.js';
import {spawnCar} from '../shared/game.js';
test('each weapon mounts above the roof with batched shared geometry',()=>{
  for(const item of WEAPON_IDS){
    const model=createCarWeaponModel(item),other=createCarWeaponModel(item);assert.notEqual(model,other);assert.equal(model.children[0].geometry,other.children[0].geometry);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());assert.ok(Math.abs(bounds.min.y-1.05)<1e-6);assert.ok(Math.max(size.x,size.y,size.z)<2.15);assert.ok(model.children.length<=5,`${item}: too many draw calls`);
  }
});
test('mounted weapons persist while ammo remains and disappear when consumed or wrecked',()=>{
  const group=new THREE.Group(),car=spawnCar();giveWeapon(car,'shotgun');syncCarWeapon(group,car);const model=group.userData.weaponModel;
  car.ammo=3;syncCarWeapon(group,car);assert.equal(group.userData.weaponModel,model);
  car.ammo=0;car.item=null;syncCarWeapon(group,car);assert.equal(group.userData.weaponModel,null);assert.equal(group.children.length,0);
  giveWeapon(car,'rocket');syncCarWeapon(group,car);car.wrecked=true;syncCarWeapon(group,car);assert.equal(group.children.length,0);
});
test('firing a one-use weapon removes the roof model using authoritative inventory',()=>{
  const car=spawnCar(),group=new THREE.Group(),room={phase:'racing',players:new Map([['driver',{id:'driver',car}]])};initCombat(room);giveWeapon(car,'shield');syncCarWeapon(group,car);assert.equal(group.children.length,1);
  pressWeapon(room,room.players.get('driver'),1000);syncCarWeapon(group,car);assert.equal(car.item,null);assert.equal(group.children.length,0);
});
