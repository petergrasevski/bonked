import test from 'node:test';
import assert from 'node:assert/strict';
import { ATMOSPHERES, createBlizzard, weatherFogDensity } from '../public/atmosphere.js';
test('blizzard stays in one fixed GPU buffer and bounded phone particle budget', () => {
  const a = createBlizzard(1600),
    b = createBlizzard(1600);
  assert.equal(a.geometry.attributes.position.count, 1600);
  assert.equal(a.geometry.attributes.flakeSize.count, 1600);
  assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array);
  assert.ok(a.geometry.attributes.position.array.every(Number.isFinite));
  assert.equal(a.material.depthWrite, false);
  assert.equal(a.frustumCulled, false);
  a.geometry.dispose();
  a.material.dispose();
  b.geometry.dispose();
  b.material.dispose();
});
test('weather fog retains foreground readability as the race camera rises', () => {
  for (const profile of Object.values(ATMOSPHERES)) {
    assert.equal(weatherFogDensity(profile, 20), profile.density);
    for (const height of [50, 100, 200, 400]) {
      const density = weatherFogDensity(profile, height);
      assert.ok(density > 0 && density <= profile.density);
      // At a typical 1.5x height sight line, no more than 35% haze covers cars.
      assert.ok(1 - Math.exp(-((density * height * 1.5) ** 2)) < 0.35);
    }
  }
});
