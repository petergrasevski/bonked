import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ScorePopups } from '../public/score-popups.js';

test('kill score popup follows its car, fades once, and releases its resources', () => {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => ({ strokeText() {}, fillText() {} }) }),
  };
  try {
    const scene = new THREE.Scene(),
      popups = new ScorePopups(scene),
      car = new THREE.Group();
    car.position.set(2, 8, 4);
    const state = {
        code: 'TEST',
        round: 1,
        startAt: 0,
        time: 100,
        effects: [
          { id: 'kill1', kind: 'kill-score', owner: 'me', at: 100, until: 1200, duration: 1100 },
        ],
      },
      cars = new Map([['me', car]]);
    popups.update(state, cars, 1000);
    assert.equal(popups.active.size, 1);
    const sprite = popups.active.get('kill1').sprite;
    assert.equal(sprite.position.x, 2);
    assert.ok(sprite.position.y > 8);
    car.position.x = 12;
    popups.update(state, cars, 1500);
    assert.equal(popups.active.size, 1);
    assert.equal(sprite.position.x, 12);
    assert.ok(sprite.position.y > 11.4);
    popups.update(state, cars, 2000);
    assert.ok(sprite.material.opacity < 1);
    popups.update(state, cars, 2101);
    assert.equal(popups.active.size, 0);
    popups.update(state, cars, 2200);
    assert.equal(popups.active.size, 0, 'snapshot replay must not repeat +1');
    state.round = 2;
    state.effects = [];
    popups.update(state, cars, 2300);
    assert.equal(popups.seen.size, 0);
    state.time = 2000;
    state.effects = ['double1', 'double2'].map((id) => ({
      id,
      kind: 'kill-score',
      owner: 'me',
      until: 3100,
      duration: 1100,
    }));
    popups.update(state, cars, 2400);
    assert.equal(popups.active.size, 2);
    const heights = [...popups.active.values()].map((p) => p.sprite.position.y);
    assert.notEqual(heights[0], heights[1], 'simultaneous kills must show separate +1 labels');
    popups.dispose();
    assert.equal(scene.children.length, 0);
  } finally {
    globalThis.document = previous;
  }
});
