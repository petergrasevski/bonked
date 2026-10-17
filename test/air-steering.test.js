import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  spawnCar,
  stepCar,
  trackAt,
  nearestTrack,
  TRACK_LENGTH,
  STEP,
  NEUTRAL,
  angleDelta,
  collideCars,
  collideDesertMoles,
} from '../shared/game.js';
import { DESERT_JUMPS } from '../shared/desert-features.js';
import { predictFleet } from '../shared/prediction.js';

function jump(ramp = DESERT_JUMPS[0]) {
  selectTrack('desert');
  const f = ramp.fraction - 0.2 / TRACK_LENGTH,
    p = trackAt(f),
    floor = nearestTrack(p.x, p.z, f);
  const car = {
    ...spawnCar(),
    x: p.x,
    z: p.z,
    y: floor.y,
    groundY: floor.y,
    trackFraction: f,
    angle: p.angle,
    pitch: Math.atan(floor.grade),
    vx: Math.cos(p.angle) * 30,
    vz: Math.sin(p.angle) * 30,
  };
  stepCar(car, NEUTRAL);
  assert.equal(car.rampFlight, true, 'crossing the lip launches the car');
  return car;
}
const drive = (steer) => ({ ...NEUTRAL, throttle: 1, steer });
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

test('desert jump steering gently adjusts heading and trajectory, with symmetric analog control and no extra speed or lift', () => {
  const start = jump(),
    results = new Map();
  for (const steer of [-1, -0.5, 0, 0.5, 1]) {
    const car = { ...start };
    for (let i = 0; i < 30; i++) stepCar(car, drive(steer));
    assert.equal(car.rampFlight, true);
    assert.equal(car.falling, false);
    results.set(steer, car);
  }
  const neutral = results.get(0),
    full = results.get(1);
  const heading = angleDelta(full.angle, neutral.angle),
    course = angleDelta(Math.atan2(full.vz, full.vx), Math.atan2(neutral.vz, neutral.vx));
  assert.ok(
    heading > 0.08 && heading < 0.11,
    'less than seven degrees of heading correction in half a second',
  );
  assert.ok(course > 0.04 && course < 0.065, 'travel direction responds more gently than the body');
  assert.ok(
    Math.hypot(full.x - neutral.x, full.z - neutral.z) > 0.1,
    'steering actually changes the flight path',
  );
  for (const [steer, car] of results) {
    close(angleDelta(car.angle, neutral.angle), heading * steer, 'analog heading');
    close(
      angleDelta(Math.atan2(car.vz, car.vx), Math.atan2(neutral.vz, neutral.vx)),
      course * steer,
      'analog course',
    );
    close(Math.hypot(car.vx, car.vz), Math.hypot(neutral.vx, neutral.vz), 'horizontal speed');
    close(car.y, neutral.y, 'height');
    close(car.vy, neutral.vy, 'vertical velocity');
    close(car.pitch, neutral.pitch, 'pitch');
    close(car.roll, neutral.roll, 'roll');
  }
  close(neutral.angle, start.angle, 'neutral preserves heading');
  close(
    angleDelta(Math.atan2(neutral.vz, neutral.vx), Math.atan2(start.vz, start.vx)),
    0,
    'neutral preserves course',
  );
});

test('air steering does not grant control over ordinary launches, mines, wrecks, falls or other tracks', () => {
  const start = jump();
  for (const changes of [
    { rampFlight: false },
    { mineFlight: true },
    { wrecked: true },
    { overturned: true },
    { falling: true },
    { finished: true },
    { spinout: 0.5 },
  ]) {
    const neutral = { ...start, ...changes },
      steered = { ...neutral };
    for (let i = 0; i < 10; i++) {
      stepCar(neutral, drive(0));
      stepCar(steered, drive(1));
    }
    for (const key of ['angle', 'vx', 'vz', 'x', 'z', 'y', 'vy'])
      close(steered[key], neutral[key], `${JSON.stringify(changes)} ${key}`);
  }
  for (const id of ['coast', 'ice']) {
    selectTrack(id);
    const neutral = { ...spawnCar(), y: 30, vy: 5, rampFlight: true, vx: 20 },
      steered = { ...neutral };
    stepCar(neutral, drive(0));
    stepCar(steered, drive(1));
    for (const key of ['angle', 'vx', 'vz']) close(steered[key], neutral[key], `${id} ${key}`);
  }
});

test('steered flights land on all four ramps and match client prediction through release, reversal and landing', () => {
  for (const ramp of DESERT_JUMPS) {
    const server = jump(ramp);
    let client = JSON.parse(JSON.stringify(server)),
      landed = false;
    for (let i = 0; i < 150; i++) {
      const input = drive(i < 20 ? 0.4 : i < 35 ? 0 : i < 55 ? -0.4 : 0);
      stepCar(server, input);
      server.raceTime += STEP;
      collideDesertMoles(server, server.raceTime);
      collideCars([server], { road: true });
      predictFleet(client, [], input, STEP);
      for (const key of ['x', 'y', 'z', 'angle', 'vx', 'vy', 'vz', 'steering'])
        close(client[key], server[key], `ramp ${ramp.id} prediction ${key}`);
      assert.equal(server.falling, false);
      assert.equal(server.health, 100);
      if (!server.rampFlight) {
        landed = true;
        break;
      }
      if (i % 3 === 2) client = JSON.parse(JSON.stringify(server));
    }
    assert.ok(landed, `ramp ${ramp.id} lands safely`);
    close(server.y, server.groundY, 'landed height');
  }
});
