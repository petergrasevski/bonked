import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  trackAt,
  roadSurfaceAt,
  spawnCar,
  constrainRoad,
  TRACK_LENGTH,
  getLandscape,
} from '../shared/game.js';
import { rotorWallSegments, collideFactoryRotors, rotorAngle } from '../shared/factory-rotors.js';
import { FACTORY_TABLES } from '../shared/extra-circuits.js';
test('both 48m platforms support their whole usable circle and rotate continuously', () => {
  selectTrack('factory');
  for (const f of FACTORY_TABLES) {
    const p = trackAt(f);
    assert.ok(p.halfWidth >= 23.9);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      assert.ok(roadSurfaceAt(p.x + Math.cos(a) * 22, p.z + Math.sin(a) * 22, f));
    }
  }
  assert.ok(Math.abs(rotorAngle(10, 0) - 2.34) < 1e-12);
  assert.ok(Math.abs(rotorAngle(10, 1) + 2.34) < 1e-12);
  assert.ok(rotorAngle(20, 0) > rotorAngle(10, 0));
});
test('rotating walls have collision, moving gaps and enough clearance for a car', () => {
  selectTrack('factory');
  const p = trackAt(FACTORY_TABLES[0]),
    walls = rotorWallSegments(p, 0, 0),
    wall = walls[Math.floor(walls.length / 2)],
    x = (wall.ax + wall.bx) / 2,
    z = (wall.az + wall.bz) / 2;
  const c = {
    ...spawnCar(),
    x,
    z,
    y: p.y,
    groundY: p.y,
    angle: Math.atan2(wall.bz - wall.az, wall.bx - wall.ax),
    vx: 12,
    vz: 0,
  };
  collideFactoryRotors(c, trackAt, 0);
  assert.ok(Math.hypot(c.x - x, c.z - z) > 0.5);
  assert.ok(Number.isFinite(c.vx) && Number.isFinite(c.vz));
  assert.notDeepEqual(rotorWallSegments(p, 0, 0), rotorWallSegments(p, 1, 0));
  // The three broad ring gaps remain clear of all wall segments.
  for (let j = 0; j < 3; j++) {
    const a = (j * Math.PI * 2) / 3,
      q = { x: p.x + Math.cos(a) * 17, z: p.z + Math.sin(a) * 17 };
    assert.ok(
      !walls
        .filter((w) => w.radius === 17)
        .some((w) => Math.hypot((w.ax + w.bx) / 2 - q.x, (w.az + w.bz) / 2 - q.z) < 4),
    );
  }
});
test('factory rotor collision is height-aware', () => {
  selectTrack('factory');
  const p = trackAt(FACTORY_TABLES[0]),
    w = rotorWallSegments(p, 0, 0)[3],
    c = { ...spawnCar(), x: (w.ax + w.bx) / 2, z: (w.az + w.bz) / 2, y: p.y + 4, groundY: p.y };
  const before = { ...c };
  collideFactoryRotors(c, trackAt, 0);
  assert.deepEqual(c, before);
});
test('volcano terrain rises inside, mixes cliffs and tumble slopes outside and never covers the road', () => {
  selectTrack('volcano');
  const terrain = getLandscape().surface;
  assert.ok(terrain.triangles.length > 7000);
  for (let i = 0; i < 120; i++) {
    const p = trackAt(i / 120),
      hit = terrain.sample(p.x, p.z);
    assert.ok(!hit || hit.y < p.y + 0.05);
    const inside = terrain.sample(p.x + p.nx * (p.halfWidth + 12), p.z + p.nz * (p.halfWidth + 12)),
      outside = terrain.sample(p.x - p.nx * (p.halfWidth + 7), p.z - p.nz * (p.halfWidth + 7));
    assert.ok(inside.y > p.y + 10);
    assert.ok(outside.y < p.y - 1);
    assert.ok(p.y >= 140 && p.y <= 153);
  }
});

test('nested maze walls spin in opposite directions with matching collision velocities', () => {
  selectTrack('factory');
  const p = trackAt(FACTORY_TABLES[0]),
    walls = rotorWallSegments(p, 4, 0),
    outer = walls.filter((w) => w.layer === 0),
    inner = walls.filter((w) => w.layer === 1);
  assert.ok(outer.length > 20 && inner.length > 15);
  assert.ok(outer.every((w) => w.omega > 0));
  assert.ok(inner.every((w) => w.omega < 0));
  assert.ok(rotorAngle(4, 0) * rotorAngle(4, 0, 1) < 0);
  const radii = outer.map((w) => Math.hypot(w.ax - p.x, w.az - p.z));
  assert.ok(Math.max(...radii) - Math.min(...radii) > 1.5);
});
test('outer volcano slopes alternate between severe cliffs and gentler descents', () => {
  selectTrack('volcano');
  const drops = [];
  for (let i = 0; i < 120; i++) {
    const p = trackAt(i / 120),
      surface = getLandscape().surface.sample(
        p.x - p.nx * (p.halfWidth + 7),
        p.z - p.nz * (p.halfWidth + 7),
      );
    drops.push(p.y - surface.y);
  }
  assert.ok(Math.max(...drops) > 30);
  assert.ok(Math.min(...drops) < 4);
});
