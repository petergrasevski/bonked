import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  trackAt,
  spawnCar,
  constrainRoad,
  stepCar,
  NEUTRAL,
  STEP,
  collideCars,
  collideCoastalCrabs,
  drivingSurfaceAt,
  terrainAt,
} from '../shared/game.js';
import { predictFleet } from '../shared/prediction.js';
import { bodyOffset, WHEEL_POINTS } from '../shared/edge-physics.js';
const at = (f, lateral) => {
  selectTrack('coast');
  const p = trackAt(f);
  return {
    ...spawnCar(),
    x: p.x + p.nx * lateral,
    z: p.z + p.nz * lateral,
    trackFraction: f,
    angle: p.angle,
  };
};
test('all open coastal banks support cars on visible dry sand', () => {
  for (const f of [0.14, 0.35, 0.6, 0.81])
    for (const side of [-1, 1]) {
      const c = at(f, side * (trackAt(f).halfWidth + 3));
      constrainRoad(c);
      for (let i = 0; i < 150; i++) stepCar(c, NEUTRAL);
      assert.equal(c.health, 100);
      assert.equal(c.falling, false);
      assert.equal(c.supportedWheels, 4);
      assert.ok(c.y < -0.2);
      assert.ok(Math.abs(c.roll) > 0.1);
      for (const [x, z] of WHEEL_POINTS) {
        const offset = bodyOffset(c, x, 0, z),
          s = terrainAt(c.x + offset.x, c.z + offset.z);
        if (s) assert.ok(c.y + offset.y >= s.y - 0.06, 'tyres stay above the bank');
      }
    }
});
test('a driver can steer from the sand back onto the road', () => {
  for (const side of [-1, 1]) {
    const f = 0.6,
      p = trackAt(f),
      c = at(f, side * (p.halfWidth + 3));
    c.angle = Math.atan2(-p.nz * side, -p.nx * side);
    constrainRoad(c);
    for (let i = 0; i < 70; i++) stepCar(c, { ...NEUTRAL, throttle: 1 });
    assert.equal(c.health, 100);
    assert.equal(c.falling, false);
    assert.ok(c.y >= -0.05, 'returned to the road');
  }
});
test('landing on dry sand recovers, while driving into water still eliminates', () => {
  const c = at(0.6, 9);
  Object.assign(c, { y: 1, vy: -2, falling: true });
  for (let i = 0; i < 120; i++) stepCar(c, NEUTRAL);
  assert.equal(c.falling, false);
  assert.equal(c.health, 100);
  const p = trackAt(0.6),
    water = at(0.6, 9);
  water.angle = Math.atan2(p.nz, p.nx);
  constrainRoad(water);
  for (let i = 0; i < 180; i++) stepCar(water, { ...NEUTRAL, throttle: 1 });
  assert.equal(water.eliminated, true);
  assert.equal(water.health, 0);
  assert.equal(drivingSurfaceAt(p.x + p.nx * 20, p.z + p.nz * 20, 0.6), null);
});
test('coastal bank movement is identical on server and client prediction', () => {
  const a = at(0.6, 9),
    b = structuredClone(a);
  for (let i = 0; i < 80; i++) {
    const input = { ...NEUTRAL, throttle: 0.3, steer: -0.1 };
    stepCar(a, input);
    a.raceTime = (a.raceTime || 0) + STEP;
    collideCoastalCrabs(a, a.raceTime);
    collideCars([a], { road: true });
    predictFleet(b, [], input, STEP);
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'pitch', 'roll', 'falling'])
      assert.equal(a[key], b[key]);
  }
});
