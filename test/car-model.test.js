import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSportsCar, disposeCarInstance } from '../public/car-model.js';
import { syncCarWeapon } from '../public/car-weapons.js';
test('removing a bot frees its own resources without disposing chassis buffers or weapons still used by other cars', () => {
  const a = createSportsCar('#ff0000'),
    b = createSportsCar('#00ff00');
  let sharedDisposals = 0,
    paintDisposals = 0,
    ownDisposals = 0;
  assert.equal(a.children[0].geometry, b.children[0].geometry);
  assert.notEqual(a.userData.paint, b.userData.paint);
  const weapon = { item: 'rocket', ammo: 1 };
  syncCarWeapon(a, weapon);
  syncCarWeapon(b, weapon);
  for (const mesh of b.children.filter((c) => c.isMesh)) {
    mesh.geometry.addEventListener('dispose', () => sharedDisposals++);
    if (mesh.material.userData.sharedCarResource)
      mesh.material.addEventListener('dispose', () => sharedDisposals++);
  }
  b.userData.weaponModel.traverse((mesh) => {
    if (mesh.isMesh) mesh.geometry.addEventListener('dispose', () => sharedDisposals++);
  });
  a.userData.paint.addEventListener('dispose', () => paintDisposals++);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
  a.add(shield);
  a.userData.shield = shield;
  shield.geometry.addEventListener('dispose', () => ownDisposals++);
  shield.material.addEventListener('dispose', () => ownDisposals++);
  disposeCarInstance(a);
  assert.equal(sharedDisposals, 0);
  assert.equal(paintDisposals, 1);
  assert.equal(ownDisposals, 2);
  assert.equal(b.children[0].geometry.userData.sharedCarResource, true);
});
