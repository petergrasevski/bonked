import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTrack, spawnCar, stepCar, trackAt, NEUTRAL, STEP } from '../shared/game.js';
import { predictFleet } from '../shared/prediction.js';
const reverse = { ...NEUTRAL, reverse: true };
const forward = (c) => c.vx * Math.cos(c.angle) + c.vz * Math.sin(c.angle);
function carAt(id, speed = 0, lateral = 0) {
  selectTrack(id);
  const fraction = id === 'ice' ? 0.12 : 0.01,
    p = trackAt(fraction);
  return {
    ...spawnCar(),
    id: 'driver',
    x: p.x,
    z: p.z,
    y: p.y,
    groundY: p.y,
    angle: p.angle,
    trackFraction: fraction,
    vx: Math.cos(p.angle) * speed - Math.sin(p.angle) * lateral,
    vz: Math.sin(p.angle) * speed + Math.cos(p.angle) * lateral,
  };
}
test('reverse responds on the first tick from rest on every circuit', () => {
  for (const id of ['coast', 'ice', 'desert']) {
    const car = carAt(id);
    stepCar(car, reverse);
    assert.ok(forward(car) < -0.3);
  }
});
test('held reverse brakes forward motion then crosses zero smoothly into reverse', () => {
  for (const id of ['coast', 'ice', 'desert']) {
    const car = carAt(id, 24),
      coast = { ...car };
    stepCar(car, reverse);
    stepCar(coast, NEUTRAL);
    assert.ok(forward(car) > 0);
    assert.ok(forward(car) < forward(coast), 'reverse brakes harder than coasting');
    let previous = forward(car),
      crossed = false;
    for (let i = 0; i < 90; i++) {
      stepCar(car, reverse);
      const speed = forward(car);
      assert.ok(speed <= previous + 1e-8, 'no acceleration forwards or oscillation at zero');
      if (previous >= 0 && speed < 0) {
        assert.ok(speed > -0.5, 'direction changes continuously');
        crossed = true;
      }
      previous = speed;
      assert.ok(speed >= -14.400001);
      assert.equal(car.falling, false);
    }
    assert.ok(crossed);
    assert.ok(forward(car) < -10);
    const speed = forward(car);
    stepCar(car, NEUTRAL);
    assert.ok(forward(car) > speed, 'releasing reverse begins slowing the car');
  }
});
test('reverse preserves lateral slide during forward braking and regains grip when backing up', () => {
  for (const id of ['coast', 'ice', 'desert']) {
    const braking = carAt(id, 20, 6),
      rolling = { ...braking },
      backing = carAt(id, -8, 6);
    stepCar(braking, reverse);
    stepCar(rolling, NEUTRAL);
    stepCar(backing, reverse);
    const slip = (c) => Math.abs(-c.vx * Math.sin(c.angle) + c.vz * Math.cos(c.angle));
    assert.ok(slip(braking) > slip(rolling));
    assert.ok(slip(backing) < slip(braking));
  }
});
test('reverse overrides acceleration and an active boost, with matching prediction through zero', () => {
  for (const id of ['coast', 'ice', 'desert']) {
    const server = carAt(id, 36);
    server.padBoostRemaining = 2;
    server.padBoostFrom = 36;
    const client = { ...server };
    const input = { ...reverse, throttle: 1 };
    stepCar(server, input);
    predictFleet(client, [], input, STEP);
    assert.ok(forward(server) < 36, 'boost cannot cancel reverse braking');
    for (let i = 0; i < 80; i++) {
      stepCar(server, input);
      predictFleet(client, [], input, STEP);
      for (const key of ['x', 'z', 'vx', 'vz', 'angle'])
        assert.ok(Math.abs(server[key] - client[key]) < 1e-10, `${id}: ${key}`);
    }
    assert.ok(forward(server) < 0);
  }
});
