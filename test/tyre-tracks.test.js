import test from 'node:test';
import assert from 'node:assert/strict';
import { createTyreTracks } from '../public/tyre-tracks.js';
import { selectTrack, spawnCar, trackAt, roadSurfaceAt } from '../shared/game.js';
function fixture(track = 'coast', fraction = 0.025) {
  selectTrack(track);
  const at = trackAt(fraction);
  return {
    tracks: createTyreTracks(),
    car: {
      ...spawnCar(),
      id: 'test',
      x: at.x,
      z: at.z,
      y: at.y,
      groundY: at.y,
      angle: at.angle - 0.35,
      vx: Math.cos(at.angle) * 25,
      vz: Math.sin(at.angle) * 25,
      trackFraction: fraction,
    },
  };
}
function advance(tracks, car, now, dt) {
  car.x += car.vx * dt;
  car.z += car.vz * dt;
  const road = roadSurfaceAt(car.x, car.z, car.trackFraction);
  if (road) car.y = car.groundY = road.y;
  tracks.update(now, [car]);
}
function dispose(t) {
  t.mesh.geometry.dispose();
  t.mesh.material.dispose();
}
test('drift tracks join exactly at each tyre, taper in, and have frame-rate-independent density', () => {
  const counts = [];
  for (const fps of [30, 60, 120]) {
    const { tracks, car } = fixture();
    tracks.update(0, [car]);
    for (let i = 1; i <= fps / 2; i++) advance(tracks, car, i / fps, 1 / fps);
    const { position: p, strength: s } = tracks.mesh.geometry.attributes;
    counts.push(tracks.mesh.geometry.drawRange.count);
    assert.ok(counts.at(-1) > 24);
    assert.equal(s.getX(0), 0);
    assert.ok(s.getX(1) > 0);
    // Each sample writes left then right; both sides of the join reuse the same vertices.
    for (let i = 0; i < counts.at(-1) - 12; i += 6)
      for (const [a, b] of [
        [i + 1, i + 12],
        [i + 4, i + 14],
      ])
        for (const get of ['getX', 'getY', 'getZ']) assert.equal(p[get](a), p[get](b));
    tracks.update(5, []);
    assert.equal(tracks.mesh.visible, false);
    dispose(tracks);
  }
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]]);
});
test('straight boosts, airborne cars, wrecks and nudges do not add drift smears', () => {
  for (const changes of [
    { boost: 1, angle: trackAt(0.025).angle },
    { falling: true },
    { overturned: true },
    { eliminated: true },
    { wrecked: true },
    { y: 20 },
    { nudgeTime: 0.1 },
    { nudgeMoved: true },
  ]) {
    const { tracks, car } = fixture();
    Object.assign(car, changes);
    tracks.update(0, [car]);
    car.x += 0.5;
    tracks.update(1 / 30, [car]);
    assert.equal(tracks.mesh.geometry.drawRange.count, 0);
    dispose(tracks);
  }
});
test('marks conform to desert slopes and bridge decks and avoid ice gaps', () => {
  for (const [track, fraction] of [
    ['desert', 0.25],
    ['desert', 0.5],
    ['ice', 0.025],
  ]) {
    const { tracks, car } = fixture(track, fraction);
    tracks.update(0, [car]);
    for (let i = 1; i <= 6; i++) advance(tracks, car, i / 30, 1 / 30);
    const p = tracks.mesh.geometry.attributes.position,
      n = tracks.mesh.geometry.drawRange.count;
    assert.ok(n > 0);
    for (let i = 0; i < n; i++) {
      const road = roadSurfaceAt(p.getX(i), p.getZ(i), fraction);
      assert.ok(road);
      assert.ok(Math.abs(p.getY(i) - road.y - 0.025) < 0.005);
    }
    dispose(tracks);
  }
  const { tracks, car } = fixture('ice');
  Object.assign(car, { x: 0, z: -40, y: 0, groundY: 0, angle: 0, vx: 20, vz: 10 });
  tracks.update(0, [car]);
  car.x += 0.6;
  car.z += 0.3;
  tracks.update(1 / 30, [car]);
  assert.equal(tracks.mesh.geometry.drawRange.count, 0);
  dispose(tracks);
});
test('teleports and long frame stalls break ribbons; storage remains bounded and resets', () => {
  const { tracks, car } = fixture();
  tracks.update(0, [car]);
  advance(tracks, car, 1 / 30, 1 / 30);
  const before = tracks.mesh.geometry.drawRange.count;
  car.x += 50;
  tracks.update(2 / 30, [car]);
  assert.equal(tracks.mesh.geometry.drawRange.count, before);
  tracks.update(1, [car]);
  assert.equal(tracks.mesh.geometry.drawRange.count, before);
  const buffer = tracks.mesh.geometry.attributes.position.array,
    at = trackAt(0.025),
    base = { ...car, x: at.x, z: at.z };
  for (let n = 0; n < 100; n++) {
    const fresh = { ...base };
    tracks.update(n + 2, [fresh]);
    for (let i = 1; i <= 20; i++) advance(tracks, fresh, n + 2 + i / 30, 1 / 30);
  }
  assert.equal(tracks.mesh.geometry.attributes.position.array, buffer);
  assert.equal(tracks.mesh.geometry.drawRange.count, 2048 * 6);
  tracks.reset();
  assert.equal(tracks.mesh.geometry.drawRange.count, 0);
  assert.equal(tracks.mesh.visible, false);
  dispose(tracks);
});
