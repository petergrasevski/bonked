import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { selectTrack, OBSTACLES } from '../shared/game.js';
import { buildFactoryInterior } from '../public/factory-interior.js';
import {
  buildFactoryDressing,
  FACTORY_PROP_TYPES,
  factoryPropClear,
} from '../public/factory-dressing.js';
function world() {
  return {
    scene: new THREE.Scene(),
    static: new THREE.Group(),
    materials: new Map(),
    mat(color) {
      if (!this.materials.has(color))
        this.materials.set(color, new THREE.MeshStandardMaterial({ color }));
      return this.materials.get(color);
    },
    mesh(geometry, color, x = 0, y = 0, z = 0, parent = this.static) {
      const mesh = new THREE.Mesh(geometry, typeof color === 'object' ? color : this.mat(color));
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    },
    box(x, y, z, w, h, d, color, parent = this.static) {
      return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
    },
    cylinder(x, y, z, r1, r2, h, color, n = 8, parent = this.static) {
      return this.mesh(new THREE.CylinderGeometry(r1, r2, h, n), color, x, y, z, parent);
    },
  };
}
function dispose(w) {
  for (const root of [w.scene, w.static]) root.traverse((o) => o.geometry?.dispose());
  for (const m of w.materials.values()) m.dispose();
}
test('factory dressing has seven deterministic prop families with clear roads and bounded geometry', () => {
  selectTrack('factory');
  const before = JSON.stringify(OBSTACLES),
    a = world(),
    b = world(),
    pa = buildFactoryDressing(a),
    pb = buildFactoryDressing(b);
  assert.deepEqual(pa, pb);
  assert.deepEqual([...new Set(pa.map((p) => p.type))].sort(), [...FACTORY_PROP_TYPES].sort());
  assert.ok(pa.length >= 28 && pa.length <= 56);
  let triangles = 0;
  const materials = new Set();
  a.static.updateMatrixWorld(true);
  a.static.traverse((o) => {
    if (!o.isMesh) return;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    materials.add(o.material);
    for (const attr of Object.values(o.geometry.attributes))
      assert.ok(attr.array.every(Number.isFinite));
  });
  assert.ok(triangles < 65000, `triangle budget ${triangles}`);
  assert.ok(materials.size <= 8);
  for (const p of pa) {
    assert.ok(factoryPropClear(p.x, p.z, p.radius));
    for (const q of pa)
      if (q !== p) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= p.radius + q.radius + 3);
  }
  assert.equal(JSON.stringify(OBSTACLES), before);
  dispose(a);
  dispose(b);
});
test('factory work cells reserve existing production lines and leave every car corridor clear', () => {
  selectTrack('factory');
  const w = world();
  buildFactoryInterior(w);
  const props = [];
  w.static.traverse((o) => {
    if (FACTORY_PROP_TYPES.includes(o.userData.sceneryKind)) props.push(o);
  });
  assert.ok(props.length >= 14, `integrated detail density: ${props.length}`);
  for (const g of props) {
    assert.ok(factoryPropClear(g.position.x, g.position.z, 10));
    const bounds = new THREE.Box3().setFromObject(g);
    assert.ok(bounds.min.y >= -8);
    assert.ok(bounds.max.y < 10);
  }
  dispose(w);
});
