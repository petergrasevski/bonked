import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  spawnCar,
  trackAt,
  START_FRACTION,
  NEUTRAL,
  SEGMENTS,
} from '../shared/game.js';
import { createChase } from '../shared/chase.js';
import {
  updateSkyBeams,
  resetSkyBeams,
  sanitizeSkyAim,
  SKY_DELAY,
  SKY_COOLDOWN,
} from '../shared/sky-beam.js';
import { skyGroundAt, skyRayGround, skyPatch } from '../shared/sky-ground.js';
import { pulsePush, PULSE_RADIUS } from '../shared/shockwave.js';
import * as THREE from 'three';
import {
  SkyBeamView,
  advanceSkyCursor,
  smoothSkyTarget,
  SkyTargetPlayback,
} from '../public/sky-beam.js';
import { readController } from '../public/controller.js';
import { joystickVector } from '../public/touch-controls.js';
function scene() {
  selectTrack('coast');
  const at = trackAt(0.025),
    caster = {
      id: 'caster',
      color: '#ff5555',
      car: { ...spawnCar(), eliminated: true },
      input: { ...NEUTRAL },
      skyAim: { x: at.x, z: at.z },
    };
  const target = {
    id: 'target',
    color: '#5555ff',
    car: {
      ...spawnCar(1),
      ...at,
      progress: 0.025 - START_FRACTION,
      x: at.x + at.nx * 8,
      z: at.z + at.nz * 8,
      health: 53,
      vx: 0,
      vz: 0,
    },
  };
  const room = {
    phase: 'racing',
    players: new Map([
      [caster.id, caster],
      [target.id, target],
    ]),
    chase: createChase([target.car]),
    serial: 0,
    effects: [],
    sounds: [],
  };
  updateSkyBeams(room, 1000);
  return { room, caster, target, at };
}
test('eliminated players fire one fixed-position beam after 600ms, with the pulse push and no damage', () => {
  const { room, caster, target, at } = scene();
  caster.input.fire = true;
  updateSkyBeams(room, 1100);
  assert.equal(room.skyBeams.length, 1);
  assert.equal(caster.skyCooldownUntil, 1100 + SKY_COOLDOWN);
  const strike = { ...room.skyBeams[0] };
  caster.skyAim = { x: at.x + 30, z: at.z + 30 };
  updateSkyBeams(room, 1100 + SKY_DELAY - 1);
  assert.equal(target.car.vx, 0);
  assert.equal(room.effects.length, 0);
  updateSkyBeams(room, 1100 + SKY_DELAY);
  assert.equal(target.car.health, 53);
  assert.ok(Math.abs(Math.hypot(target.car.vx, target.car.vz) - pulsePush(8)) < 1e-8);
  assert.equal(room.effects.length, 1);
  assert.equal(room.effects[0].radius, PULSE_RADIUS);
  assert.equal(room.effects[0].color, caster.color);
  assert.equal(room.effects[0].x, strike.x);
  assert.equal(room.effects[0].z, strike.z);
  const vx = target.car.vx;
  updateSkyBeams(room, 1800);
  assert.equal(target.car.vx, vx);
  assert.equal(room.effects.length, 1);
  caster.input.fire = false;
  updateSkyBeams(room, 2000);
  caster.input.fire = true;
  updateSkyBeams(room, 2100);
  assert.equal(room.skyBeams.length, 1);
  updateSkyBeams(room, 5000);
  assert.equal(room.skyBeams.length, 0, 'holding fire cannot queue another shot');
  caster.input.fire = false;
  updateSkyBeams(room, 5010);
  caster.input.fire = true;
  updateSkyBeams(room, 5020);
  assert.equal(room.skyBeams.length, 1);
});
test('sky beams respect shields, vertical separation, racing phase and elimination eligibility', () => {
  for (const flag of ['shield', 'finished', 'eliminated', 'falling', 'otherDeck', 'outOfRange']) {
    const { room, caster, target } = scene();
    if (flag === 'otherDeck') target.car.y += 5;
    else if (flag === 'outOfRange') target.car.x += 100;
    else target.car[flag] = true;
    caster.input.fire = true;
    updateSkyBeams(room, 1100);
    updateSkyBeams(room, 1700);
    assert.equal(target.car.vx, 0, flag);
    assert.equal(target.car.vz, 0, flag);
    assert.equal(target.car.health, 53);
  }
  const { room, caster } = scene();
  caster.car.eliminated = false;
  caster.input.fire = true;
  updateSkyBeams(room, 1100);
  assert.equal(room.skyBeams.length, 0);
  assert.equal(caster.skyTarget, null);
  caster.car.eliminated = true;
  room.phase = 'finished';
  updateSkyBeams(room, 1200);
  assert.equal(room.skyBeams.length, 0);
});
test('target input is finite, bounded near the race, and ignores claimed height', () => {
  for (const aim of [null, {}, { x: NaN, z: 0 }, { x: 0, z: Infinity }, { x: '4', z: 5 }])
    assert.equal(sanitizeSkyAim(aim), null);
  assert.deepEqual(sanitizeSkyAim({ x: 4, z: 5, y: 999 }), { x: 4, z: 5 });
  const { room, caster, target } = scene();
  caster.skyAim = { x: 1e10, z: -1e10, y: 1e5 };
  updateSkyBeams(room, 1200);
  assert.ok(Math.hypot(caster.skyTarget.x - target.car.x, caster.skyTarget.z - target.car.z) < 150);
  assert.equal(caster.skyTarget.y, skyGroundAt(caster.skyTarget.x, caster.skyTarget.z).y);
});
test('ground queries use upper bridge decks, ice gaps, and sloping desert surfaces', () => {
  for (const track of ['coast', 'ice', 'desert']) {
    selectTrack(track);
    for (const f of [0.02, 0.18, 0.25, 0.36, 0.7]) {
      const p = trackAt(f),
        g = skyGroundAt(p.x, p.z),
        hit = skyRayGround({ x: p.x, y: 100, z: p.z }, { x: 0, y: -1, z: 0 });
      assert.ok(Math.abs(hit.y - g.y) < 1e-8);
      assert.ok(skyPatch(p.x, p.z).every(Number.isFinite));
    }
    if (track === 'ice') assert.equal(skyGroundAt(0, -40).y, -4);
    if (track === 'desert') {
      const p = trackAt(0.25);
      assert.ok(skyGroundAt(p.x, p.z).y > 35);
    }
  }
  selectTrack('desert');
  const crossing = SEGMENTS.filter((s) => Math.hypot(s.x, s.z) < 10).sort((a, b) => b.y - a.y)[0];
  assert.ok(skyGroundAt(crossing.x, crossing.z).y >= crossing.y - 0.1);
});
test('screen cursor remains stationary without input, is bounded, and has normalized joystick/controller axes', () => {
  const cursor = { x: 0.2, y: -0.3 };
  advanceSkyCursor(cursor, { x: 0, y: 0 }, 1);
  assert.deepEqual(cursor, { x: 0.2, y: -0.3 });
  advanceSkyCursor(cursor, { x: 1, y: 1 }, 0.5);
  assert.ok(cursor.x > 0.2 && cursor.y > -0.3);
  advanceSkyCursor(cursor, { x: 1, y: 1 }, 100);
  assert.deepEqual(cursor, { x: 0.82, y: 0.76 });
  assert.deepEqual(joystickVector(0, -30, 30), { x: 0, y: 1 });
  const diagonal = joystickVector(100, 100, 30);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-8);
  const pad = readController([
    { connected: true, mapping: 'standard', axes: [0.8, -1], buttons: [] },
  ]);
  assert.ok(pad.steer > 0);
  assert.equal(pad.aimY, 1);
  assert.equal(readController([]).aimY, 0);
});

test('new rounds reset targeting, pending strikes and cooldowns', () => {
  const { room, caster } = scene();
  caster.input.fire = true;
  updateSkyBeams(room, 1100);
  resetSkyBeams(room);
  assert.equal(room.skyBeams.length, 0);
  assert.equal(caster.skyTarget, null);
  assert.equal(caster.skyAim, null);
  assert.equal(caster.skyCooldownUntil, 0);
  assert.equal(caster.skyFireLatch, false);
});
test('an idle target retains its screen position as the race camera translates and turns', () => {
  selectTrack('desert');
  const p = trackAt(0.665),
    view = new SkyBeamView(new THREE.Scene()),
    camera = new THREE.PerspectiveCamera(58, 1.8, 0.1, 1000),
    state = {
      code: 'test',
      round: 1,
      phase: 'racing',
      time: 0,
      players: [{ id: 'me', eliminated: true, color: '#ff5555' }],
    };
  let previous;
  for (const angle of [0, 0.2, 0.5]) {
    const x = p.x + angle * 20,
      z = p.z + angle * 10;
    camera.position.set(x - Math.cos(angle) * 40, 40, z - Math.sin(angle) * 40);
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    view.update(state, 'me', camera, { x, z, spread: 0 }, { x: 0, y: 0 }, 1 / 60);
    const target = new THREE.Vector3(view.aim.x, skyGroundAt(view.aim.x, view.aim.z).y, view.aim.z),
      screen = target.clone().project(camera);
    assert.ok(Math.abs(screen.x) < 0.0001 && Math.abs(screen.y) < 0.0001);
    if (previous) assert.ok(target.distanceTo(previous) > 1);
    previous = target;
  }
  view.update(state, 'me', camera, { x: p.x, z: p.z, spread: 0 }, { x: 1, y: 0 }, 1 / 60);
  const center = view.targets.get('me').material.uniforms.center.value;
  assert.equal(center.x, view.aim.x);
  assert.equal(center.y, view.aim.z, 'local aiming has no smoothing delay');
  view.update(null, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  assert.equal(view.targets.size, 0);
  assert.equal(view.aim, null);
});

test('eliminated bots never receive targets or fire sky beams', () => {
  const { room, caster } = scene();
  caster.bot = true;
  caster.input.fire = true;
  for (const now of [1100, 1800, 5000]) updateSkyBeams(room, now);
  assert.equal(caster.skyTarget, null);
  assert.equal(room.skyBeams.length, 0);
  assert.equal(room.effects.length, 0);
});
test('other players see human spectator targets and their cooldown, but never bot targets', () => {
  selectTrack('coast');
  const at = trackAt(0.025),
    view = new SkyBeamView(new THREE.Scene()),
    camera = new THREE.PerspectiveCamera();
  const remote = {
    id: 'remote',
    eliminated: true,
    color: '#ff5555',
    skyTarget: { x: at.x, z: at.z },
    skyCooldownUntil: 2000,
  };
  const state = {
    phase: 'racing',
    time: 1000,
    players: [{ id: 'me', eliminated: false }, remote, { ...remote, id: 'bot', bot: true }],
  };
  view.update(state, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  assert.deepEqual([...view.targets.keys()], ['remote']);
  assert.equal(view.aim, null);
  const marker = view.targets.get('remote');
  assert.equal(marker.material.uniforms.opacity.value, 0.3);
  assert.equal(marker.material.uniforms.center.value.x, remote.skyTarget.x);
  remote.skyTarget.x += 2;
  state.time = 2000;
  view.update(state, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  assert.ok(
    marker.material.uniforms.center.value.x > remote.skyTarget.x - 2 &&
      marker.material.uniforms.center.value.x < remote.skyTarget.x,
    'remote target moves smoothly instead of snapping',
  );
  assert.equal(marker.material.uniforms.opacity.value, 0.72);
  state.round = 2;
  view.update(state, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  assert.equal(
    marker.material.uniforms.center.value.x,
    remote.skyTarget.x,
    'new round discards old smoothing',
  );
  view.update(null, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  assert.equal(view.targets.size, 0);
});

test('remote target damping is frame-rate independent and settles when updates stop', () => {
  const results = [30, 60, 120].map((hz) => {
    let pose = smoothSkyTarget(null, { x: 0, z: 4 }, 0);
    const target = { x: 10, z: -6 };
    for (let i = 0; i < hz / 2; i++) pose = smoothSkyTarget(pose, target, 1 / hz);
    assert.ok(Math.abs(pose.x - target.x) < 0.001 && Math.abs(pose.z - target.z) < 0.001);
    assert.deepEqual(target, { x: 10, z: -6 }, 'rendering never changes the authoritative target');
    return pose;
  });
  for (const field of ['x', 'z', 'vx', 'vz'])
    assert.ok(
      Math.max(...results.map((p) => p[field])) - Math.min(...results.map((p) => p[field])) < 1e-10,
    );
  const teleport = smoothSkyTarget(results[0], { x: 200, z: 100 }, 1 / 60);
  assert.deepEqual(teleport, { x: 200, z: 100, vx: 0, vz: 0 });
});
test('uneven 20 Hz target updates move continuously at 30/60/120 Hz without packet-sized jumps', () => {
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz,
      arrivals = [0.035, 0.065, 0.045, 0.055],
      target = { x: 0, z: 0 };
    let pose,
      next = 0.05,
      packet = 0,
      previous,
      rawPrevious = 0;
    const renderedSteps = [],
      rawSteps = [];
    for (let i = 0; i < hz * 3; i++) {
      const t = i * dt;
      if (t >= next) {
        target.x = 30 * t;
        target.z = -15 * t;
        next += arrivals[packet++ % arrivals.length];
      }
      pose = smoothSkyTarget(pose, target, dt);
      if (t > 1) {
        renderedSteps.push(pose.x - previous);
        rawSteps.push(target.x - rawPrevious);
        assert.ok(pose.x > previous, 'moves between packets');
      }
      previous = pose.x;
      rawPrevious = target.x;
    }
    const variation = (steps) =>
      Math.sqrt(steps.reduce((sum, v) => sum + (v - 30 * dt) ** 2, 0) / steps.length);
    assert.ok(
      variation(renderedSteps) < variation(rawSteps) * 0.3,
      `${hz} Hz must remove most packet jitter`,
    );
    const stopped = { ...target };
    for (let i = 0; i < hz; i++) pose = smoothSkyTarget(pose, stopped, dt);
    assert.ok(Math.abs(pose.x - stopped.x) < 1e-6, 'stale targets settle, never extrapolate away');
  }
});

test('buffered remote targets move steadily through uneven arrivals at 30/60/120Hz', () => {
  for (const hz of [30, 60, 120]) {
    const playback = new SkyTargetPlayback(),
      dt = 1 / hz;
    let pose,
      previous,
      packet = 0;
    const speeds = [];
    for (let frame = 0; frame < hz * 5; frame++) {
      const now = frame * dt * 1000;
      while (packet * 50 + 15 + [0, 9, 2, 13][packet % 4] <= now) {
        playback.push({ x: packet * 1.5, z: -packet * 0.75 }, packet * 50);
        packet++;
      }
      const target = playback.sample(now + 25);
      if (!target) continue;
      pose = smoothSkyTarget(pose, target, dt);
      if (previous && now > 1000) speeds.push((pose.x - previous.x) / dt);
      previous = { ...pose };
    }
    const rms = Math.sqrt(speeds.reduce((n, v) => n + (v - 30) ** 2, 0) / speeds.length);
    assert.ok(rms < 0.1, `${hz}Hz error ${rms}`);
  }
});
test('remote target playback is bounded during loss, cannot rewind, and resets on teleport', () => {
  const playback = new SkyTargetPlayback();
  playback.push({ x: 0, z: 0 }, 0);
  playback.push({ x: 1.5, z: 0 }, 50);
  assert.equal(playback.sample(10000).x, 1.5);
  assert.equal(playback.sample(0).x, 1.5);
  playback.push({ x: 200, z: 0 }, 10000);
  assert.equal(playback.sample(10000).x, 200);
});
test('remote marker view uses authoritative sample ticks and the rendered race clock', () => {
  selectTrack('ice');
  const road = trackAt(0.12),
    view = new SkyBeamView(new THREE.Scene());
  const camera = new THREE.PerspectiveCamera(58, 1, 0.2, 1000),
    frame = { x: road.x, z: road.z, spread: 10 };
  const remote = {
    id: 'remote',
    color: '#ff5555',
    eliminated: true,
    bot: false,
    skyTarget: { x: road.x, z: road.z },
    skyCooldownUntil: 0,
  };
  const state = {
    phase: 'racing',
    code: 'ABC',
    round: 1,
    trackId: 'ice',
    players: [remote],
    simulationTick: 60,
    raceTime: 1.03,
    time: 5000,
    combatTime: 5030,
    skyBeams: [],
  };
  view.update(state, 'local', camera, frame, { x: 0, y: 0 }, 1 / 60);
  state.simulationTick = 63;
  state.raceTime = 1.08;
  remote.skyTarget = { x: road.x + 1.5, z: road.z };
  view.update(state, 'local', camera, frame, { x: 0, y: 0 }, 1 / 60);
  const playback = view.targets.get('remote').userData.playback;
  assert.equal(playback.samples.at(-1).time, 1050);
  assert.equal(playback.samples.length, 2);
  assert.deepEqual(
    remote.skyTarget,
    { x: road.x + 1.5, z: road.z },
    'presentation never changes the server target',
  );
  view.update(null, 'local', camera, frame, { x: 0, y: 0 }, 1 / 60);
  assert.equal(view.targets.size, 0);
});

test('LAN phone and gamepad cursors keep their screen positions as the host camera moves, turns and zooms', () => {
  selectTrack('desert');
  const at = trackAt(0.665),
    view = new SkyBeamView(new THREE.Scene()),
    camera = new THREE.PerspectiveCamera(58, 1.8, 0.1, 1000);
  const state = {
    code: 'lan',
    round: 1,
    startAt: 1000,
    trackId: 'desert',
    phase: 'racing',
    time: 1000,
    players: ['pad', 'phone'].map((id) => ({
      id,
      connected: true,
      eliminated: true,
      color: '#ff5555',
      skyTarget: { x: at.x, z: at.z },
    })),
  };
  const controls = new Map([
    ['pad', { x: 0, y: 0 }],
    ['phone', { x: 0, y: 0 }],
  ]);
  let previous;
  for (const angle of [0, 0.2, 0.5]) {
    const x = at.x + angle * 20,
      z = at.z + angle * 10;
    camera.position.set(
      x - Math.cos(angle) * (40 + angle * 10),
      40 + angle * 5,
      z - Math.sin(angle) * (40 + angle * 10),
    );
    camera.lookAt(x, 0, z);
    camera.updateMatrixWorld();
    view.update(
      state,
      'lan-display',
      camera,
      { x, z, spread: 0 },
      { x: 0, y: 0 },
      1 / 60,
      controls,
    );
    assert.equal(view.externalAims.size, 2);
    for (const id of controls.keys()) {
      const aim = view.externalAims.get(id),
        screen = new THREE.Vector3(aim.x, skyGroundAt(aim.x, aim.z).y, aim.z).project(camera);
      assert.ok(
        Math.abs(screen.x) < 0.0001 && Math.abs(screen.y) < 0.0001,
        `${id} stays at screen centre while the camera moves`,
      );
      const marker = view.targets.get(id).material.uniforms.center.value;
      assert.equal(marker.x, aim.x);
      assert.equal(marker.y, aim.z, 'host targets are not delayed by remote playback');
    }
    const aim = view.externalAims.get('pad');
    if (previous) assert.ok(Math.hypot(aim.x - previous.x, aim.z - previous.z) > 1);
    previous = { ...aim };
  }
  controls.set('pad', { x: 0.2, y: 0 });
  view.update(
    state,
    'lan-display',
    camera,
    { x: at.x + 10, z: at.z + 5, spread: 0 },
    { x: 0, y: 0 },
    0.1,
    controls,
  );
  assert.ok(
    view.externalCursors.get('pad').x > view.externalCursors.get('phone').x,
    'each controller has its own cursor',
  );
  state.round++;
  controls.set('pad', { x: 0, y: 0 });
  view.update(
    state,
    'lan-display',
    camera,
    { x: at.x + 10, z: at.z + 5, spread: 0 },
    { x: 0, y: 0 },
    1 / 60,
    controls,
  );
  assert.equal(view.externalCursors.get('pad').x, 0, 'new rounds reset screen cursors');
  view.update(null, 'lan-display', camera, {}, { x: 0, y: 0 }, 1 / 60, controls);
  assert.equal(view.externalCursors.size, 0);
  assert.equal(view.externalAims.size, 0);
});
