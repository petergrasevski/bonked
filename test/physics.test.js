import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnCar,
  stepCar,
  botInput,
  sanitizeInput,
  NEUTRAL,
  nearestTrack,
  collideCars,
  STEP,
  trackAt,
  LAPS,
  carContact,
} from '../shared/game.js';
test('invalid network controls cannot introduce non-finite physics', () => {
  assert.deepEqual(
    sanitizeInput({ steer: Infinity, throttle: NaN, reverse: 'true', brake: 1 }),
    NEUTRAL,
  );
  assert.equal(sanitizeInput({ steer: 9, throttle: 100 }).steer, 1);
  const car = spawnCar();
  for (let i = 0; i < 600; i++)
    stepCar(car, sanitizeInput({ steer: i % 2 ? 1e99 : -1e99, throttle: 99 }));
  assert.ok(Number.isFinite(car.x) && Number.isFinite(car.z));
  assert.ok(nearestTrack(car.x, car.z).distance <= nearestTrack(car.x, car.z).halfWidth);
});
test('bot navigates every turn and completes three real laps', () => {
  const car = spawnCar();
  let frames = 0;
  while (car.progress < LAPS && frames++ < 60 * 450) stepCar(car, botInput(car));
  assert.ok(car.progress >= LAPS, `only reached ${car.progress} laps`);
  assert.ok(frames > 60 * 180, 'cannot complete three laps by skipping the course');
});
test('reverse reduces race progress and cannot award a lap', () => {
  const car = spawnCar();
  const before = car.progress;
  for (let i = 0; i < 150; i++) stepCar(car, { ...NEUTRAL, reverse: true });
  assert.ok(car.progress < before);
  assert.equal(car.lap, 1);
});
test('handbrake produces more lateral slip than normal grip', () => {
  const base = spawnCar();
  base.vx = 20 * Math.cos(base.angle);
  base.vz = 20 * Math.sin(base.angle);
  const normal = { ...base },
    drift = { ...base };
  for (let i = 0; i < 25; i++) {
    stepCar(normal, { ...NEUTRAL, throttle: 1, steer: 0.8 });
    stepCar(drift, { ...NEUTRAL, throttle: 1, steer: 0.8, brake: true });
  }
  const slip = (c) => Math.abs(-c.vx * Math.sin(c.angle) + c.vz * Math.cos(c.angle));
  assert.ok(slip(drift) > slip(normal) * 1.2);
});
test('collisions separate cars, transfer momentum, and remain finite at exact overlap', () => {
  const a = spawnCar(),
    b = { ...a, x: a.x + 2 };
  a.vx = 10;
  b.vx = -10;
  collideCars([a, b]);
  assert.equal(carContact(a, b), null);
  assert.ok(a.vx < 10 && b.vx > -10);
  const c = spawnCar(),
    d = { ...c };
  collideCars([c, d]);
  assert.ok(Number.isFinite(c.x));
  assert.equal(carContact(c, d), null);
});
test('neutral input brings a released accelerator to a stop', () => {
  const car = spawnCar();
  car.vx = 15;
  for (let i = 0; i < 60 * 5; i++) stepCar(car, NEUTRAL, STEP);
  assert.ok(Math.hypot(car.vx, car.vz) < 0.02);
});
