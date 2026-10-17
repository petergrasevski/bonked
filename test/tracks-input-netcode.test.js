import { DESERT_JUMPS } from '../shared/desert-features.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  TRACK,
  TRACK_LENGTH,
  SEGMENTS,
  trackAt,
  nearestTrack,
  hasBarrier,
  spawnCar,
  stepCar,
  botInput,
  NEUTRAL,
  collideCars,
  STEP,
} from '../shared/game.js';
import { RenderCorrections } from '../shared/netcode.js';
import { predictFleet } from '../shared/prediction.js';
import { readController } from '../public/controller.js';
import { createPickups, collectPickup, giveWeapon, pressWeapon } from '../shared/combat.js';

test('ice straights are 60% of the original length; turn approaches remain exposed', () => {
  selectTrack('ice');
  assert.ok(TRACK_LENGTH > 2000 && TRACK_LENGTH < 2050);
  assert.ok(
    Math.abs(Math.max(...TRACK.map((p) => p.x)) - Math.min(...TRACK.map((p) => p.x)) - 950.4) <
      1e-8,
  );
  assert.ok(Math.max(...TRACK.map((p) => p.z)) - Math.min(...TRACK.map((p) => p.z)) < 90);
  const straight = TRACK.filter((p) => Math.abs(p.z + 40) < 1e-8);
  assert.ok(
    Math.abs(
      Math.max(...straight.map((p) => p.x)) - Math.min(...straight.map((p) => p.x)) - 1524 * 0.6,
    ) < 1e-8,
  );
  for (const s of SEGMENTS) {
    if (Math.abs(s.x) > 150)
      assert.equal(hasBarrier(s.start / TRACK_LENGTH), Math.abs(s.x) > 457.200001);
    assert.ok(Math.abs(s.halfWidth - s.nextHalfWidth) < 0.4);
  }
});
test('ice retains substantially more lateral momentum than asphalt', () => {
  const slip = [];
  for (const id of ['coast', 'ice']) {
    selectTrack(id);
    const p = trackAt(0.1),
      c = {
        ...spawnCar(),
        x: p.x,
        z: p.z,
        angle: p.angle,
        trackFraction: 0.1,
        vx: Math.cos(p.angle) * 20 - Math.sin(p.angle) * 6,
        vz: Math.sin(p.angle) * 20 + Math.cos(p.angle) * 6,
      };
    for (let i = 0; i < 12; i++) stepCar(c, NEUTRAL);
    slip.push(Math.abs(-c.vx * Math.sin(c.angle) + c.vz * Math.cos(c.angle)));
  }
  assert.ok(slip[1] > slip[0] * 3, JSON.stringify(slip));
});
test('desert crossing stays on its own route and bridge level; stacked cars do not collide', () => {
  selectTrack('desert');
  const high = nearestTrack(0, 0, 0),
    low = nearestTrack(0, 0, 0.5);
  assert.ok(high.y > 19);
  assert.ok(low.y < 0.01);
  assert.ok(Math.abs(high.fraction - low.fraction) > 0.4);
  const a = { ...spawnCar(), x: 0, z: 0, y: 20, groundY: 20, trackFraction: 0 },
    b = { ...a, y: 0, groundY: 0, trackFraction: 0.5 };
  collideCars([a, b]);
  assert.equal(a.x, 0);
  assert.equal(b.x, 0);
});
test('bots navigate a full lap on each new course, including all four desert jumps', () => {
  for (const id of ['ice', 'desert']) {
    selectTrack(id);
    const c = spawnCar();
    let jumps = 0,
      wasAir = false;
    for (let i = 0; i < 20000 && c.progress < 1 && !c.eliminated; i++) {
      stepCar(c, botInput(c));
      if (c.rampFlight && !wasAir) jumps++;
      wasAir = !!c.rampFlight;
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    }
    assert.ok(c.progress >= 1, `${id} stopped at ${c.progress}`);
    assert.equal(c.falling, false);
    assert.equal(c.health, 100);
    if (id === 'desert') assert.equal(jumps, DESERT_JUMPS.length);
  }
});
test('pickups on a bridge cannot be collected from the road below', () => {
  selectTrack('desert');
  const pickups = createPickups(() => 0),
    p = pickups.find((p) => p.y > 5);
  assert.ok(p);
  const c = { ...spawnCar(), x: p.x, z: p.z, y: 0, groundY: 0 };
  assert.equal(collectPickup(c, [p], 1), null);
  c.y = p.y;
  c.groundY = p.y;
  assert.equal(collectPickup(c, [p], 1), p);
});
test('track switching restores independent cached geometry', () => {
  selectTrack('coast');
  const length = TRACK_LENGTH,
    p = trackAt(0.3);
  selectTrack('desert');
  selectTrack('ice');
  selectTrack('coast');
  assert.equal(TRACK_LENGTH, length);
  assert.deepEqual(trackAt(0.3), p);
  assert.throws(() => selectTrack('__proto__'));
});
test('standard DualSense mapping, proportional steering, deadzone and disconnect', () => {
  const pad = {
    connected: true,
    mapping: 'standard',
    axes: [0.57],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  for (const i of [0, 2, 5, 6, 7]) pad.buttons[i] = { pressed: true, value: 1 };
  const r = readController([null, pad]);
  assert.ok(Math.abs(r.steer - 0.5) < 1e-10);
  assert.equal(r.throttle, 1);
  for (const key of ['reverse', 'fire', 'left', 'right']) assert.equal(r[key], true);
  pad.axes[0] = 0.1;
  assert.equal(readController([pad]).steer, 0);
  pad.connected = false;
  assert.equal(readController([pad]).throttle, 0);
  assert.equal(readController([pad]).connected, false);
});
test('replicated steering predicts opponents through turns instead of a straight extrapolation', () => {
  selectTrack('coast');
  const local = spawnCar(),
    p = trackAt(0.1),
    peer = {
      ...spawnCar(),
      id: 'peer',
      x: p.x,
      z: p.z,
      angle: p.angle,
      trackFraction: 0.1,
      vx: Math.cos(p.angle) * 20,
      vz: Math.sin(p.angle) * 20,
      input: { ...NEUTRAL, steer: 0.4, throttle: 1 },
    },
    expected = { ...peer };
  for (let i = 0; i < 5; i++) {
    stepCar(expected, peer.input);
    predictFleet(local, [peer], NEUTRAL, STEP);
  }
  assert.ok(Math.abs(peer.angle - expected.angle) < 1e-10);
  assert.ok(Math.hypot(peer.x - expected.x, peer.z - expected.z) < 1e-10);
});
test('snapshot correction is continuous, decays, wraps angles and resets teleports', () => {
  const smooth = new RenderCorrections(),
    a = { id: 'a', x: 10, z: 0, y: 0, angle: Math.PI - 0.02, vx: 30, vz: 0 },
    b = { ...a, x: 9.7, angle: -Math.PI + 0.02 };
  smooth.reconcile([a], [b]);
  const first = smooth.render(b, 0);
  assert.ok(Math.abs(first.x - a.x) < 1e-10);
  assert.ok(Math.abs(Math.sin(first.angle) - Math.sin(a.angle)) < 1e-10);
  let last;
  for (let i = 0; i < 60; i++) last = smooth.render(b, 1 / 60);
  assert.ok(Math.abs(last.x - b.x) < 0.001);
  const teleported = { ...b, x: 200 };
  smooth.reconcile([b], [teleported]);
  assert.equal(smooth.render(teleported, 0).x, 200);
});
test('fractional tick rendering moves on 120 Hz frames without mutating physics', () => {
  const smooth = new RenderCorrections(),
    car = { id: 'a', x: 0, z: 0, y: 0, angle: 0, vx: 30, vz: 0 };
  assert.equal(smooth.render(car, 0, 1 / 120).x, 0.25);
  assert.equal(car.x, 0);
});
