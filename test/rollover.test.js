import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spawnCar,
  trackAt,
  selectTrack,
  stepCar,
  collideCars,
  resolveNudges,
  NEUTRAL,
  STEP,
  CAR_WIDTH,
} from '../shared/game.js';
import { predictFleet } from '../shared/prediction.js';
import { rolloverLift } from '../shared/rollover.js';
import { bodyOffset } from '../shared/edge-physics.js';
import { SteeringTouches, driveThrottle } from '../public/touch-controls.js';
import { botControls } from '../bots.js';

function roof(track = 'coast') {
  selectTrack(track);
  const f = 0.01,
    p = trackAt(f);
  return {
    ...spawnCar(),
    x: p.x,
    z: p.z,
    y: p.y,
    groundY: p.y,
    angle: p.angle,
    trackFraction: f,
    roll: Math.PI,
    pitch: 0,
    overturned: true,
  };
}
const recovery = (steer) => ({ ...NEUTRAL, steer, throttle: 1 });
function advance(car, input, seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepCar(car, input);
}
function recover(car, input) {
  let seconds = 0;
  while (car.overturned && seconds < 3) {
    stepCar(car, input);
    seconds += STEP;
  }
  return seconds;
}
function sideHit(car, direction = 1, speed = 12) {
  const nx = -Math.sin(car.angle) * direction,
    nz = Math.cos(car.angle) * direction;
  const other = {
    ...spawnCar(1),
    x: car.x - nx * (CAR_WIDTH - 0.1),
    z: car.z - nz * (CAR_WIDTH - 0.1),
    y: car.y,
    groundY: car.groundY,
    angle: car.angle,
    vx: nx * speed,
    vz: nz * speed,
  };
  collideCars([other, car], { damage: false });
  return other;
}

test('either full steering direction recovers gradually in 0.5–1 second on every circuit', () => {
  for (const track of ['coast', 'ice', 'desert'])
    for (const steer of [-1, 1]) {
      const c = roof(track),
        start = { x: c.x, z: c.z };
      advance(c, recovery(steer), 0.25);
      assert.equal(c.overturned, true);
      assert.ok(Math.cos(c.roll) > -1 && Math.cos(c.roll) < 0);
      assert.equal(c.x, start.x);
      assert.equal(c.z, start.z);
      const seconds = 0.25 + recover(c, recovery(steer));
      assert.ok(seconds >= 0.5 && seconds <= 1, `${track}: ${seconds}`);
      assert.equal(c.health, 100);
      assert.equal(c.eliminated, false);
      advance(c, { ...NEUTRAL, throttle: 1 }, 0.2);
      assert.ok(Math.hypot(c.vx, c.vz) > 1);
    }
});

test('steering alone, throttle alone, partial controls, braking and reverse do not auto-right a roof', () => {
  for (const input of [
    NEUTRAL,
    { ...NEUTRAL, steer: 1 },
    { ...NEUTRAL, throttle: 1 },
    recovery(0.8),
    { ...recovery(1), throttle: 0.8 },
    { ...recovery(1), reverse: true },
    { ...recovery(1), brake: true },
  ]) {
    const c = roof();
    advance(c, input, 2);
    assert.equal(c.overturned, true);
    assert.ok(Math.abs(Math.cos(c.roll) + 1) < 1e-8);
  }
});

test('releasing before the tipping point rocks back; reversing input changes the roll', () => {
  const c = roof();
  advance(c, recovery(1), 0.15);
  advance(c, NEUTRAL, 2);
  assert.equal(c.overturned, true);
  assert.ok(Math.abs(Math.cos(c.roll) + 1) < 0.001);
  const turn = roof();
  advance(turn, recovery(1), 0.2);
  advance(turn, recovery(-1), 0.2);
  assert.ok(turn.rollVelocity < 0);
  assert.ok(recover(turn, recovery(-1)) < 1);
});

test('touch hold uses existing automatic throttle to recover in both directions', () => {
  for (const [x, steer] of [
    [50, -1],
    [150, 1],
  ]) {
    const touches = new SteeringTouches();
    touches.start(1, x, 0, 0, { left: 0, width: 200 });
    assert.equal(touches.steer, steer);
    const input = {
      ...NEUTRAL,
      steer: touches.steer,
      throttle: driveThrottle({ mobile: true, phase: 'racing' }),
    };
    assert.ok(recover(roof(), input) < 1);
  }
});

test('side contacts move and rock a roof, and assist a recovery already in progress', () => {
  for (const steer of [-1, 1]) {
    const c = roof(),
      start = { x: c.x, z: c.z };
    sideHit(c, -steer);
    assert.ok(Math.hypot(c.vx, c.vz) > 1);
    assert.ok(c.rollVelocity * steer > 1);
    stepCar(c, NEUTRAL);
    assert.ok(Math.hypot(c.x - start.x, c.z - start.z) > 0.05);
    assert.notEqual(Math.cos(c.roll), -1);
    const assisted = roof(),
      alone = roof();
    advance(assisted, recovery(steer), 0.25);
    advance(alone, recovery(steer), 0.25);
    sideHit(assisted, -steer, 6);
    assert.ok(recover(assisted, recovery(steer)) < recover(alone, recovery(steer)));
  }
});

test('strong sideways shoves can turn a car over without recovery input', () => {
  for (const direction of [-1, 1]) {
    const c = roof();
    sideHit(c, direction, 30);
    assert.ok(recover(c, NEUTRAL) < 3);
  }
});

test('a powered nudge transfers both translation and roll to an overturned target', () => {
  const c = roof(),
    nx = -Math.sin(c.angle),
    nz = Math.cos(c.angle);
  const other = {
    ...spawnCar(1),
    x: c.x - nx * (CAR_WIDTH - 0.1),
    z: c.z - nz * (CAR_WIDTH - 0.1),
    y: c.y,
    groundY: c.groundY,
    angle: c.angle,
    nudgeAngle: c.angle,
    nudgeDirection: 1,
    nudgeMoved: true,
  };
  resolveNudges([other, c], { damage: false });
  assert.ok(c.rollVelocity < 0);
  assert.ok(Math.hypot(c.vx, c.vz) > 0);
  const velocity = c.rollVelocity;
  resolveNudges([other, c], { damage: false });
  assert.equal(c.rollVelocity, velocity);
});

test('recovery never revives a wreck, eliminated or finished car, or applies in midair', () => {
  for (const changes of [
    { wrecked: true, eliminated: true, health: 0 },
    { eliminated: true },
    { finished: true },
    { stun: 5 },
  ]) {
    const c = Object.assign(roof(), changes);
    advance(c, recovery(1), 1);
    assert.equal(c.overturned, true);
    for (const [key, value] of Object.entries(changes))
      if (key !== 'stun') assert.equal(c[key], value);
  }
  const airborne = roof();
  airborne.y += 8;
  advance(airborne, recovery(1), 0.25);
  assert.ok(Math.abs(airborne.roll - Math.PI) < 1e-8);
  const falling = roof();
  falling.falling = true;
  falling.y += 20;
  advance(falling, recovery(1), 0.1);
  assert.ok(Math.abs(falling.roll - Math.PI) < 1e-8);
});

test('authority and fleet prediction agree through contact and recovery', () => {
  const server = roof(),
    pusher = sideHit(server, -1, 8),
    client = { ...server },
    peer = { ...pusher };
  for (let i = 0; i < 70; i++) {
    stepCar(server, recovery(1));
    stepCar(pusher, NEUTRAL);
    collideCars([server, pusher], { road: true, damage: false });
    predictFleet(client, [peer], recovery(1), STEP);
    for (const [a, b] of [
      [server, client],
      [pusher, peer],
    ]) {
      for (const key of ['x', 'y', 'z', 'roll', 'rollVelocity', 'vx', 'vz'])
        assert.ok(Math.abs(a[key] - b[key]) < 1e-8, key);
      assert.equal(a.overturned, b.overturned);
    }
  }
  assert.equal(client.overturned, false);
});

test('recovery timing stays consistent at different simulation step sizes', () => {
  const times = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const c = roof();
    let time = 0;
    while (c.overturned && time < 2) {
      stepCar(c, recovery(1), dt);
      time += dt;
    }
    assert.equal(c.overturned, false);
    times.push(time);
  }
  assert.ok(Math.max(...times) - Math.min(...times) < 0.08);
});

test('rendered rolling chassis stays above the road', () => {
  const c = roof();
  for (let i = 0; i <= 60; i++) {
    c.roll = (i * Math.PI) / 60;
    const lift = rolloverLift(c);
    for (const y of [0, 1.05])
      for (const z of [-1.05, 1.05]) assert.ok(bodyOffset(c, 0, y, z).y + lift >= -1e-8);
  }
});

test('bots hold full steering and throttle until their car is upright', () => {
  const c = roof(),
    player = { car: c },
    room = { raceTime: 0 };
  for (let i = 0; i < 60 && c.overturned; i++) {
    const input = botControls(room, player, 0, () => 0.5);
    assert.equal(input.throttle, 1);
    assert.equal(Math.abs(input.steer), 1);
    stepCar(c, input);
  }
  assert.equal(c.overturned, false);
});
