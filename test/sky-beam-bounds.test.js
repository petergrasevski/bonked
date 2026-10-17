import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  selectTrack,
  trackAt,
  nearestTrack,
  iceSplit,
  spawnCar,
  NEUTRAL,
  START_FRACTION,
} from '../shared/game.js';
import {
  boundedSkyAim,
  clampSkyAimToTrack,
  SKY_TRACK_MARGIN,
  updateSkyBeams,
} from '../shared/sky-beam.js';
import { skyGroundAt } from '../shared/sky-ground.js';
import { createChase, cameraFrame } from '../shared/chase.js';
import { SkyBeamView } from '../public/sky-beam.js';

function withinTrack(aim) {
  const p = nearestTrack(aim.x, aim.z);
  assert.ok(
    p.distance <= p.halfWidth + 0.6 + SKY_TRACK_MARGIN + 1e-6,
    `target ${JSON.stringify(aim)} is ${p.distance}m from a ${p.halfWidth}m half-width road`,
  );
}

test('aim stays on the circuit or within ten metres of its outer road edge', () => {
  for (const track of ['coast', 'ice', 'desert']) {
    selectTrack(track);
    for (let i = 0; i < 100; i++) {
      const p = trackAt(i / 100),
        frame = { ...p, spread: 0 };
      for (const side of [-1, 1]) {
        const free = {
          x: p.x + p.nx * side * (p.halfWidth + 0.6 + 9),
          z: p.z + p.nz * side * (p.halfWidth + 0.6 + 9),
        };
        assert.deepEqual(
          boundedSkyAim(free, frame),
          free,
          `${track} leaves the shoulder freely aimable`,
        );
        for (const distance of [40, 100, 1e8]) {
          const aim = boundedSkyAim(
            { x: p.x + p.nx * side * distance, z: p.z + p.nz * side * distance },
            frame,
          );
          withinTrack(aim);
          assert.ok(Number.isFinite(skyGroundAt(aim.x, aim.z).y));
        }
      }
    }
  }
});

test('both ice splits allow continuous travel from one lane through the gap to the other', () => {
  selectTrack('ice');
  for (const z of [-40, 40])
    for (const x of [-100, 0, 100]) {
      const road = nearestTrack(x, z);
      assert.ok(iceSplit(x) > 0);
      for (let offset = -road.halfWidth; offset <= road.halfWidth; offset += 0.25) {
        const aim = { x, z: z + offset };
        assert.deepEqual(boundedSkyAim(aim, { x, z, spread: 0 }), aim);
      }
      assert.deepEqual(clampSkyAimToTrack({ x, z }), { x, z });
    }
});

test('an off-map client aim is constrained before target publication and firing', () => {
  for (const track of ['coast', 'ice', 'desert']) {
    selectTrack(track);
    const p = trackAt(0.12),
      car = {
        ...spawnCar(),
        x: p.x,
        z: p.z,
        y: p.y,
        trackFraction: 0.12,
        progress: 0.12 - START_FRACTION,
      };
    const caster = {
      id: 'caster',
      car: { ...car, eliminated: true },
      color: '#ff5555',
      input: { ...NEUTRAL },
      skyAim: { x: 1e8, z: -1e8 },
    };
    const room = {
      phase: 'racing',
      players: new Map([
        ['caster', caster],
        ['driver', { id: 'driver', car }],
      ]),
      chase: createChase([car]),
      serial: 0,
      effects: [],
      sounds: [],
    };
    updateSkyBeams(room, 1000);
    const expected = boundedSkyAim(caster.skyAim, cameraFrame(room.chase, [caster.car, car]));
    assert.equal(caster.skyTarget.x, expected.x);
    assert.equal(caster.skyTarget.z, expected.z);
    withinTrack(caster.skyTarget);
    caster.input.fire = true;
    updateSkyBeams(room, 1100);
    assert.equal(room.skyBeams.length, 1);
    withinTrack(room.skyBeams[0]);
    assert.equal(room.skyBeams[0].y, skyGroundAt(expected.x, expected.z).y);
    const strike = { ...room.skyBeams[0] };
    caster.skyAim = { x: -1e8, z: 1e8 };
    updateSkyBeams(room, 1200);
    assert.deepEqual(
      room.skyBeams[0],
      strike,
      'moving the target never moves an already locked strike',
    );
  }
});

test('holding against the boundary does not build an invisible cursor offset', () => {
  selectTrack('ice');
  const p = trackAt(0.1),
    frame = { ...p, spread: 0 },
    view = new SkyBeamView(new THREE.Scene());
  const camera = new THREE.PerspectiveCamera(58, 1.8, 0.1, 1000);
  camera.up.set(0, 0, -1);
  camera.position.set(p.x, 80, p.z);
  camera.lookAt(p.x, 0, p.z);
  camera.updateMatrixWorld();
  const state = {
    code: 'bounds',
    round: 1,
    trackId: 'ice',
    phase: 'racing',
    time: 0,
    players: [{ id: 'me', eliminated: true, color: '#ff5555' }],
  };
  for (let i = 0; i < 120; i++) {
    view.update(state, 'me', camera, frame, { x: 0, y: -1 }, 1 / 60);
    withinTrack(view.aim);
  }
  const edge = { ...view.aim },
    road = nearestTrack(edge.x, edge.z);
  assert.ok(Math.abs(road.distance - road.halfWidth - 0.6 - SKY_TRACK_MARGIN) < 1e-6);
  const screen = new THREE.Vector3(edge.x, skyGroundAt(edge.x, edge.z).y, edge.z).project(camera);
  assert.ok(Math.abs(screen.x - view.cursor.x) < 1e-8 && Math.abs(screen.y - view.cursor.y) < 1e-8);
  view.update(state, 'me', camera, frame, { x: 0, y: 1 }, 1 / 60);
  assert.ok(view.aim.z < edge.z - 0.1, 'the first reverse-input frame moves back onto the track');
  view.update(null, 'me', camera, frame, { x: 0, y: 0 }, 0);
});

test('remote target interpolation cannot cut across out-of-bounds scenery', () => {
  selectTrack('ice');
  const a = trackAt(0.1),
    b = trackAt(0.6),
    view = new SkyBeamView(new THREE.Scene()),
    camera = new THREE.PerspectiveCamera();
  const remote = {
    id: 'remote',
    eliminated: true,
    color: '#ff5555',
    skyTarget: { x: a.x, z: a.z },
  };
  const state = {
    code: 'remote',
    round: 1,
    trackId: 'ice',
    phase: 'racing',
    time: 0,
    players: [{ id: 'me', eliminated: false }, remote],
  };
  view.update(state, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
  // The visible marker is constrained even while its smoothing state is between roads.
  const mesh = view.targets.get('remote');
  mesh.userData.motion = { x: b.x, z: 0, vx: 0, vz: 0 };
  remote.skyTarget = { x: b.x, z: b.z };
  for (let i = 0; i < 30; i++) {
    view.update(state, 'me', camera, {}, { x: 0, y: 0 }, 1 / 60);
    const center = mesh.material.uniforms.center.value;
    withinTrack({ x: center.x, z: center.y });
  }
  view.update(null, 'me', camera, {}, { x: 0, y: 0 }, 0);
});
