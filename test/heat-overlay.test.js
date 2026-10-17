import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { HeatOverlay } from '../public/heat-overlay.js';
class Element {
  constructor() {
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classes = new Set();
    this.classList = {
      toggle: (name, on) => (on ? this.classes.add(name) : this.classes.delete(name)),
    };
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  setAttribute() {}
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
}
test('every heated player gets a thermometer; cooled or removed players lose it', (t) => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  t.after(() => {
    globalThis.document = original;
  });
  const container = new Element(),
    overlay = new HeatOverlay(container),
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.updateMatrixWorld();
  const players = [0.5, 1.5, 3, 0].map((circuitHeat, i) => ({
    id: String(i),
    x: i - 1.5,
    y: 0,
    z: -20,
    circuitHeat,
  }));
  overlay.update(players, camera, 800, 600);
  assert.equal(overlay.items.size, 3);
  assert.equal(overlay.items.get('0').element.classes.has('burning'), false);
  assert.equal(overlay.items.get('1').element.classes.has('burning'), true);
  assert.equal(overlay.items.get('2').fill.style.height, '100%');
  overlay.update([{ ...players[0], circuitHeat: 0.1 }], camera, 800, 600);
  assert.equal(overlay.items.size, 1);
  overlay.update([{ ...players[0], circuitHeat: 0 }], camera, 800, 600);
  assert.equal(overlay.items.size, 0);
  overlay.dispose();
  assert.equal(container.children.length, 0);
});
test('thermometers hide when their vehicle is behind the camera', (t) => {
  const original = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  t.after(() => {
    globalThis.document = original;
  });
  const overlay = new HeatOverlay(new Element()),
    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  camera.updateMatrixWorld();
  overlay.update([{ id: 'behind', x: 0, y: 0, z: 20, circuitHeat: 2 }], camera, 800, 600);
  assert.equal(overlay.items.get('behind').element.hidden, true);
  overlay.dispose();
});
