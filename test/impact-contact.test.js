import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnCar,
  weaponImpact,
  weaponImpactScale,
  damageCar,
  selectTrack,
  trackAt,
  STEP,
  NEUTRAL,
  stepCar,
  CAR_LENGTH,
  collideCars,
  constrainRoad,
  TOP_SPEED,
} from '../shared/game.js';
import { PAD_DURATION } from '../shared/boost-pads.js';
import { predictFleet } from '../shared/prediction.js';
const gas = { ...NEUTRAL, throttle: 1 };
function onRoad() {
  selectTrack('coast');
  const p = trackAt(0.01);
  return {
    ...spawnCar(),
    x: p.x,
    z: p.z,
    y: p.y,
    groundY: p.y,
    angle: p.angle,
    trackFraction: 0.01,
  };
}

test('weapon impulse ramps strongly with pre-hit damage and applies torque at the contact point', () => {
  const results = [100, 70, 30, 5].map((health) => {
    const c = { ...spawnCar(), health, angle: 0 };
    weaponImpact(
      c,
      { x: 12, z: 0, up: 8, point: { x: c.x + 2, y: c.y + 0.2, z: c.z + 0.8 } },
      health,
    );
    return c;
  });
  assert.equal(results[0].vy, 0);
  assert.ok(Math.abs(results[0].vx) < 1);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i].vy > results[i - 1].vy);
    assert.ok(results[i].vx > results[i - 1].vx);
  }
  assert.ok(results[2].vy > 10);
  assert.ok(Math.abs(results[2].rollVelocity) > 1);
  assert.ok(Math.abs(results[2].pitchVelocity) > 1);
  assert.ok(Math.abs(results[2].yawVelocity) > 0.5);
  const a = { ...spawnCar(), angle: 0 },
    b = { ...spawnCar(), angle: 0 };
  weaponImpact(a, { up: 8, point: { x: a.x, y: a.y, z: a.z + 1 } }, 30);
  weaponImpact(b, { up: 8, point: { x: b.x, y: b.y, z: b.z - 1 } }, 30);
  assert.ok(a.rollVelocity * b.rollVelocity < 0, 'opposite contact sides produce opposite roll');
  assert.equal(weaponImpactScale(100), 0.06);
});
test('a lethal hit retains its damage-scaled launch and shields reject all impulses', () => {
  const c = spawnCar();
  c.health = 30;
  damageCar(c, 42);
  weaponImpact(c, { up: 8, x: 12, point: { x: c.x + 1, y: 0, z: c.z + 0.7 } }, 30);
  assert.ok(c.wrecked);
  assert.ok(c.vy > 20);
  assert.ok(c.vx > 20);
  const shielded = { ...spawnCar(), shield: 2 },
    before = structuredClone(shielded);
  weaponImpact(shielded, { mine: true, x: 50 }, 5);
  assert.deepEqual(shielded, before);
});
test('boosted wall impacts retain weaker thrust without restoring collision-lost speed', () => {
  const car = onRoad(),
    p = trackAt(0.01);
  Object.assign(car, {
    x: p.x + p.nx * (p.halfWidth - CAR_LENGTH / 2 - 0.05),
    z: p.z + p.nz * (p.halfWidth - CAR_LENGTH / 2 - 0.05),
    angle: Math.atan2(p.nz, p.nx),
    vx: p.nx * 54,
    vz: p.nz * 54,
    padBoostRemaining: PAD_DURATION,
    padBoostFrom: 20,
  });
  stepCar(car, gas);
  assert.ok(car.padBoostRemaining > 0);
  assert.ok(car.padBoostPower < 0.3);
  assert.ok(Math.hypot(car.vx, car.vz) < 12);
  const start = { x: car.x, z: car.z };
  for (let i = 0; i < 180; i++) {
    stepCar(car, gas);
    assert.ok(Math.hypot(car.vx, car.vz) <= TOP_SPEED + 1);
    assert.ok(Math.hypot(car.x - start.x, car.z - start.z) < 12);
  }
});
test('wall and car rubbing retain actual body contact points for bounded sparks', () => {
  const c = onRoad(),
    p = trackAt(0.01);
  Object.assign(c, {
    x: p.x + p.nx * (p.halfWidth - 1),
    z: p.z + p.nz * (p.halfWidth - 1),
    vx: 30 * Math.cos(p.angle) + 3 * p.nx,
    vz: 30 * Math.sin(p.angle) + 3 * p.nz,
  });
  constrainRoad(c);
  assert.ok(c.contactTime > 0);
  assert.equal(c.contact.kind, 'wall');
  assert.ok(c.contact.speed > 20);
  assert.ok(Math.abs(c.contact.z) > 0.8);
  const a = { ...onRoad(), angle: 0, vx: 30, vz: 0 },
    b = { ...onRoad(), angle: 0, x: a.x + 1, z: a.z + 1.9, vx: 10, vz: 0 };
  collideCars([a, b]);
  assert.equal(a.contact.kind, 'car');
  assert.equal(b.contact.kind, 'car');
  assert.ok(a.contactTime > 0 && b.contactTime > 0);
  const authority = onRoad(),
    predicted = structuredClone(authority);
  for (let i = 0; i < 30; i++) {
    stepCar(authority, gas);
    predictFleet(predicted, [], gas, STEP);
  }
  assert.ok(Math.abs(authority.x - predicted.x) < 1e-9);
});

test('boost thrust also softens after a car impact and remains usable afterwards', () => {
  const a = onRoad(),
    p = trackAt(0.01),
    b = { ...onRoad(), x: a.x + Math.cos(a.angle) * 4, z: a.z + Math.sin(a.angle) * 4 };
  Object.assign(a, {
    vx: Math.cos(a.angle) * 54,
    vz: Math.sin(a.angle) * 54,
    padBoostRemaining: PAD_DURATION,
    padBoostFrom: 30,
  });
  collideCars([a, b], { damage: false });
  assert.ok(a.padBoostPower > 0 && a.padBoostPower < 0.8);
  assert.ok(a.padBoostRemaining > 0);
  const speed = Math.hypot(a.vx, a.vz);
  stepCar(a, gas);
  assert.ok(Math.hypot(a.vx, a.vz) < speed + 2, 'collision speed cannot be restored instantly');
  assert.ok(a.padBoostRemaining > 0 && a.padBoostPower > 0);
  assert.ok(
    a.vx * Math.cos(p.angle) + a.vz * Math.sin(p.angle) > 0,
    'the remaining thrust still drives forward',
  );
});
