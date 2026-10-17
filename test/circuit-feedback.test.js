import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  selectTrack,
  trackAt,
  TRACK_LENGTH,
  spawnCar,
  stepCar,
  STEP,
  NEUTRAL,
  updateFactoryMechanics,
  hasBarrier,
  TRACKS,
  OBSTACLES,
  nearestTrack,
} from '../shared/game.js';
import {
  FACTORY_TIPS,
  FACTORY_TIP,
  FACTORY_TABLES,
  factoryTipAngle,
  pressState,
  applyCircuitForces,
  VOLCANO_VENTS,
  volcanoVentSpec,
  FACTORY_PRESSES,
  volcanoLavaBounds,
  VOLCANO_HOT,
  circuitSurface,
} from '../shared/extra-circuits.js';
import { cameraFrame, createChase } from '../shared/chase.js';
import { stepCamera, cameraPose, CAMERA_FOV } from '../shared/camera.js';
import { predictFleet } from '../shared/prediction.js';
function placed(f, lane = 0) {
  const p = trackAt(f);
  return {
    ...spawnCar(),
    x: p.x + p.nx * lane,
    z: p.z + p.nz * lane,
    y: p.y,
    groundY: p.y,
    angle: p.angle,
    trackFraction: f,
    progress: f - 0.012,
  };
}
test('steam launch uses jump landings and retains forward momentum', () => {
  selectTrack('volcano');
  const f = VOLCANO_VENTS[0],
    p = trackAt(f),
    c = placed(f, -p.halfWidth * 0.58);
  c.raceTime = 2.55;
  c.vx = Math.cos(p.angle) * 18;
  c.vz = Math.sin(p.angle) * 18;
  applyCircuitForces(c, 'volcano', { ...p, fraction: f }, TRACK_LENGTH, c.raceTime, STEP);
  assert.equal(c.rampFlight, true);
  assert.ok(c.vy > 0);
  for (let i = 0; i < 90 && c.rampFlight; i++) {
    stepCar(c, NEUTRAL);
    c.raceTime += STEP;
  }
  assert.equal(c.falling, false);
  assert.equal(c.rampFlight, false);
  assert.ok(Math.hypot(c.vx, c.vz) > 14);
  assert.ok(Math.abs(c.y - c.groundY) < 0.01);
});
test('press displacement is continuous through lowering, contact and recovery', () => {
  assert.equal(pressState(2).stroke, 0);
  assert.equal(pressState(2.2).stroke, 1);
  assert.equal(pressState(2.5).active, true);
  assert.equal(pressState(3).stroke, 0);
  for (let t = 0; t < 3; t += 0.005) {
    assert.ok(Math.abs(pressState(t + 0.005).stroke - pressState(t).stroke) < 0.04);
    if (pressState(t).active) assert.ok(pressState(t).stroke > 0.9);
  }
});
test('a left-lane button activates all racers, cannot be held to retrigger, and stays room-local', () => {
  selectTrack('factory');
  const f = FACTORY_TIP.fraction + FACTORY_TIP.buttonOffset / TRACK_LENGTH,
    p = trackAt(f),
    a = placed(f, p.halfWidth * 0.6),
    b = placed(FACTORY_TIP.fraction, -3);
  updateFactoryMechanics([a, b], 10);
  assert.equal(a.factoryTipAt, 10);
  assert.equal(b.factoryTipAt, 10);
  updateFactoryMechanics([b, a], 11);
  assert.equal(a.factoryTipAt, 10);
  assert.equal(b.factoryTipAt, 10);
  const fresh = placed(0.8);
  updateFactoryMechanics([fresh], 11);
  assert.equal(fresh.factoryTipAt, null);
  assert.equal(factoryTipAngle(10, 10), 0);
  assert.ok(factoryTipAngle(10.25, 10) > 0.6);
  assert.ok(Math.abs(factoryTipAngle(11.2, 10) - FACTORY_TIP.maxAngle) < 1e-10);
  assert.ok(factoryTipAngle(12, 10) > 0.5);
  assert.equal(factoryTipAngle(13.31, 10), 0);
});
test('the tipping road lowers cars and pushes downhill without immediate destruction', () => {
  selectTrack('factory');
  const c = placed(FACTORY_TIP.fraction, -2.5);
  c.factoryTipAt = 0;
  c.raceTime = 0.24;
  stepCar(c, NEUTRAL);
  assert.ok(c.y < 4);
  assert.equal(c.health, 100);
  assert.equal(c.eliminated, false);
  const p = trackAt(c.trackFraction);
  assert.ok(c.vx * p.nx + c.vz * p.nz < 0);
  assert.equal(hasBarrier(FACTORY_TIP.fraction, -1), false);
});
test('button state and ramp motion match multiplayer prediction', () => {
  selectTrack('factory');
  const f = FACTORY_TIP.fraction + FACTORY_TIP.buttonOffset / TRACK_LENGTH,
    p = trackAt(f),
    a = placed(f, p.halfWidth * 0.6),
    b = placed(FACTORY_TIP.fraction, -2),
    expected = [{ ...a }, { ...b }],
    predicted = [{ ...a }, { ...b }];
  for (let i = 0; i < 20; i++) {
    updateFactoryMechanics(expected, (expected[0].raceTime || 0) + STEP);
    for (const c of expected) {
      stepCar(c, NEUTRAL);
      c.raceTime += STEP;
    }
    predictFleet(predicted[0], [predicted[1]], NEUTRAL, STEP);
  }
  for (let i = 0; i < 2; i++) {
    assert.equal(predicted[i].factoryTipAt, expected[i].factoryTipAt);
    assert.ok(Math.hypot(predicted[i].x - expected[i].x, predicted[i].z - expected[i].z) < 1e-8);
    assert.equal(predicted[i].y, expected[i].y);
  }
});
test('rotating platforms have no perimeter guardrails', () => {
  selectTrack('factory');
  for (const f of FACTORY_TABLES)
    for (const offset of [-32, 0, 32])
      for (const side of [-1, 1]) assert.equal(hasBarrier(f + offset / TRACK_LENGTH, side), false);
});
test('lava banks taper organically and agree with the heat footprint', () => {
  selectTrack('volcano');
  for (const zone of VOLCANO_HOT) {
    const center = volcanoLavaBounds(zone.fraction, TRACK_LENGTH)[0],
      tip = volcanoLavaBounds(
        zone.fraction + (zone.length * 0.499) / TRACK_LENGTH,
        TRACK_LENGTH,
      )[0];
    assert.ok(tip[1] - tip[0] < (center[1] - center[0]) * 0.25);
    for (let i = 1; i < 20; i++) {
      const f = zone.fraction + ((i / 20 - 0.5) * zone.length) / TRACK_LENGTH,
        p = trackAt(f),
        [lo, hi] = volcanoLavaBounds(f, TRACK_LENGTH)[0];
      assert.equal(
        circuitSurface('volcano', f, ((lo + hi) / 2) * p.halfWidth, p.halfWidth, TRACK_LENGTH, 0)
          .kind,
        'heat',
      );
      assert.notEqual(
        circuitSurface('volcano', f, (lo - 0.02) * p.halfWidth, p.halfWidth, TRACK_LENGTH, 0).kind,
        'heat',
      );
    }
  }
});
test('a track camera profile moves outside the volcano and retains car containment', () => {
  selectTrack('volcano');
  for (const aspect of [1.3, 2.2])
    for (let f = 0.04; f < 1; f += 0.08) {
      const cars = [placed(f, -3), placed(f - 0.02, 3)],
        target = cameraFrame(createChase(cars), cars),
        profile = TRACKS.volcano.camera,
        frame = stepCamera(null, target, cars, aspect, STEP, profile),
        pose = cameraPose(frame),
        p = trackAt(f);
      assert.ok(frame.angle - target.angle >= profile.yawOffset - 1e-10);
      assert.ok(frame.pitch <= (25 * Math.PI) / 180);
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV, aspect, 0.2, frame.far);
      camera.position.set(pose.x, pose.y, pose.z);
      camera.lookAt(pose.targetX, pose.targetY, pose.targetZ);
      camera.updateMatrixWorld();
      for (const c of cars) {
        const v = new THREE.Vector3(c.x, c.y + 2, c.z).project(camera);
        assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1);
      }
    }
});

test('tactical uphill driving can escape the triggered ramp', () => {
  selectTrack('factory');
  const p = trackAt(FACTORY_TIP.fraction),
    c = placed(FACTORY_TIP.fraction, -2.5);
  c.factoryTipAt = 0;
  c.angle = Math.atan2(p.nz, p.nx);
  c.vx = p.nx * 13;
  c.vz = p.nz * 13;
  for (let i = 0; i < 30; i++) {
    stepCar(c, { ...NEUTRAL, throttle: 1 });
    c.raceTime += STEP;
  }
  assert.equal(c.falling, false);
  assert.equal(c.eliminated, false);
  assert.ok(c.health > 90);
  assert.ok((c.x - p.x) * p.nx + (c.z - p.z) * p.nz > 0);
  assert.ok(Math.abs(c.y - p.y) < 0.1);
});

test('the relocated 35-degree panel is followed by its button', () => {
  assert.ok(FACTORY_TIP.fraction > 0.5);
  assert.ok(FACTORY_TIP.buttonOffset > FACTORY_TIP.length / 2);
  assert.ok(Math.abs(FACTORY_TIP.maxAngle - (35 * Math.PI) / 180) < 1e-12);
});
test('contact with the factory floor eliminates immediately, even before the fall timeout', () => {
  selectTrack('factory');
  const c = placed(0.4, 40);
  c.falling = true;
  c.offRoadTime = 0;
  c.y = -7.99;
  c.groundY = 5;
  c.vy = -5;
  c.shield = 20;
  stepCar(c, NEUTRAL);
  assert.equal(c.eliminated, true);
  assert.equal(c.health, 0);
  assert.ok(c.offRoadTime < 0.1);
});
test('wider presses roam the inner two thirds and hold their strike position', () => {
  selectTrack('factory');
  const positions = new Set();
  for (let i = 0; i < 3; i++)
    for (let t = 0; t < 30; t += 0.05) {
      const state = pressState(t, i);
      assert.ok(state.width > 0.5);
      assert.ok(state.lane - state.width / 2 > -1 / 3);
      assert.ok(state.lane + state.width / 2 < 1);
      positions.add(state.lane.toFixed(2));
      const f = FACTORY_PRESSES[i],
        p = trackAt(f);
      for (const q of [-0.9, -0.6, -0.34])
        assert.notEqual(
          circuitSurface(
            'factory',
            f,
            q * p.insideSide * p.halfWidth,
            p.halfWidth,
            TRACK_LENGTH,
            t,
            p.insideSide,
          ).kind,
          'press',
        );
    }
  assert.ok(positions.size > 25);
  assert.equal(pressState(2.25).lane, pressState(2.6).lane);
  assert.notEqual(pressState(2.5).lane, pressState(5.5).lane);
});
test('steam claw placement spans different lanes, sizes and road angles', () => {
  const specs = VOLCANO_VENTS.map((_, i) => volcanoVentSpec(i));
  assert.ok(specs.some((v) => v.lane < -0.4));
  assert.ok(specs.some((v) => v.lane > 0.4));
  assert.ok(specs.some((v) => Math.abs(v.lane) < 0.15));
  assert.ok(new Set(specs.map((v) => v.yaw.toFixed(2))).size > 12);
  assert.ok(new Set(specs.map((v) => v.scale)).size >= 4);
  selectTrack('volcano');
  for (const [i, v] of specs.entries()) {
    const p = trackAt(v.fraction);
    assert.equal(
      circuitSurface(
        'volcano',
        v.fraction,
        v.lane * p.halfWidth,
        p.halfWidth,
        TRACK_LENGTH,
        2.55 - i * 0.37,
      ).kind,
      'vent',
    );
  }
});
test('road rocks form edge clusters and keep the middle racing line clear', () => {
  selectTrack('volcano');
  assert.ok(OBSTACLES.length > 0 && OBSTACLES.length < 56);
  for (const o of OBSTACLES) {
    const p = nearestTrack(o.x, o.z, o.fraction);
    assert.ok(p.distance > p.halfWidth - 1);
    assert.ok(p.distance - o.radius > 4.5);
    assert.ok(OBSTACLES.some((q) => q !== o && Math.hypot(q.x - o.x, q.z - o.z) < 6));
  }
});
test('spreading racers move the volcano camera sideways instead of overhead', () => {
  selectTrack('volcano');
  const profile = TRACKS.volcano.camera,
    frames = [];
  for (const metres of [0, 40, 100]) {
    const cars = [placed(0.3), placed(0.3 - metres / TRACK_LENGTH)],
      target = cameraFrame(createChase(cars), cars),
      frame = stepCamera(null, target, cars, 2, STEP, profile);
    frames.push({ frame, target });
    assert.ok(frame.pitch <= (25 * Math.PI) / 180);
    assert.ok(frame.pitch >= (19.9 * Math.PI) / 180);
  }
  assert.ok(frames[2].frame.pitch < frames[0].frame.pitch);
  assert.ok(frames[2].frame.angle - frames[2].target.angle > 1.4);
});

test('the second panel has an approach button and independent replicated state', () => {
  selectTrack('factory');
  const tip = FACTORY_TIPS[1];
  assert.ok(tip.buttonOffset < -tip.length / 2);
  const f = tip.fraction + tip.buttonOffset / TRACK_LENGTH,
    p = trackAt(f),
    button = placed(f, p.halfWidth * 0.6),
    rider = placed(tip.fraction, -2.5),
    original = placed(FACTORY_TIP.fraction, -2.5);
  updateFactoryMechanics([button, rider, original], 10);
  for (const c of [button, rider, original]) {
    assert.equal(c[tip.stateKey], 10);
    assert.equal(c.factoryTipAt, null);
    c.raceTime = 10.24;
  }
  stepCar(rider, NEUTRAL);
  stepCar(original, NEUTRAL);
  assert.ok(rider.y < 4);
  assert.equal(original.y, 5);
  assert.equal(hasBarrier(tip.fraction, -1), false);
  const expected = [{ ...button }, { ...rider }],
    predicted = expected.map((c) => ({ ...c }));
  for (let i = 0; i < 20; i++) {
    updateFactoryMechanics(expected, expected[0].raceTime + STEP);
    for (const c of expected) {
      stepCar(c, NEUTRAL);
      c.raceTime += STEP;
    }
    predictFleet(predicted[0], [predicted[1]], NEUTRAL, STEP);
  }
  for (let i = 0; i < 2; i++) {
    assert.equal(predicted[i][tip.stateKey], expected[i][tip.stateKey]);
    assert.ok(Math.hypot(predicted[i].x - expected[i].x, predicted[i].z - expected[i].z) < 1e-8);
    assert.equal(predicted[i].y, expected[i].y);
  }
});

test('volcano fast lava lanes and their entrances are clear of rock obstacles', () => {
  selectTrack('volcano');
  for (const zone of VOLCANO_HOT)
    for (let along = -zone.length / 2; along <= zone.length / 2; along += 1) {
      const fraction = zone.fraction + along / TRACK_LENGTH,
        bounds = volcanoLavaBounds(fraction, TRACK_LENGTH);
      if (!bounds) continue;
      const p = trackAt(fraction);
      for (const [lo, hi] of bounds)
        for (let i = 0; i <= 8; i++) {
          const lateral = (lo + ((hi - lo) * i) / 8) * p.halfWidth,
            x = p.x + p.nx * lateral,
            z = p.z + p.nz * lateral;
          for (const o of OBSTACLES)
            assert.ok(
              Math.hypot(x - o.x, z - o.z) > o.radius + 1.05,
              'a whole car can use the lava lane without touching a boulder',
            );
        }
    }
});
