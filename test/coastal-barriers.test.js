import test from 'node:test';
import assert from 'node:assert/strict';
import { COAST_OUTER_GAPS, isCoastalBeach } from '../shared/coastal-barriers.js';
import {
  selectTrack,
  hasBarrier,
  trackAt,
  angleDelta,
  TRACK_LENGTH,
  spawnCar,
  constrainRoad,
  stepCar,
  NEUTRAL,
  STEP,
  SEGMENTS,
  getLandscape,
} from '../shared/game.js';
import { beachSegments } from '../shared/beach-profile.js';
import { sweepTrackWalls } from '../shared/weapon-geometry.js';

test('four coastal openings follow the outside of turns and keep their inside bumpers', () => {
  selectTrack('coast');
  assert.equal(COAST_OUTER_GAPS.length, 4);
  for (const gap of COAST_OUTER_GAPS) {
    assert.ok((gap.to - gap.from) * TRACK_LENGTH >= 45 && (gap.to - gap.from) * TRACK_LENGTH <= 60);
    for (let f = gap.from + 0.0001; f < gap.to; f += 0.001) {
      const turn = angleDelta(
        trackAt(f + 10 / TRACK_LENGTH).angle,
        trackAt(f - 10 / TRACK_LENGTH).angle,
      );
      assert.ok(turn * gap.side < 0, 'opening faces away from the inside of the bend');
      assert.equal(hasBarrier(f, gap.side), false);
      assert.equal(hasBarrier(f, -gap.side), true);
      assert.equal(hasBarrier(f), true, 'one guarded side keeps the existing asphalt surface');
      assert.equal(hasBarrier(f + 1, gap.side), false);
      assert.equal(hasBarrier(f - 1, gap.side), false);
    }
    assert.equal(hasBarrier(gap.from - 0.001, gap.side), true);
    assert.equal(hasBarrier(gap.to + 0.001, gap.side), true);
  }
});
test('cars can be pushed through each open edge while the opposite bumper still stops them', () => {
  selectTrack('coast');
  for (const gap of COAST_OUTER_GAPS) {
    const f = (gap.from + gap.to) / 2,
      p = trackAt(f);
    for (const side of [gap.side, -gap.side]) {
      const car = {
        ...spawnCar(),
        x: p.x + p.nx * (p.halfWidth - 0.15) * side,
        z: p.z + p.nz * (p.halfWidth - 0.15) * side,
        y: p.y,
        groundY: p.y,
        angle: p.angle,
        trackFraction: f,
        progress: f,
        vx: p.nx * 18 * side,
        vz: p.nz * 18 * side,
      };
      const before = { x: car.x, z: car.z };
      constrainRoad(car);
      if (side === gap.side) {
        assert.ok(
          Math.hypot(car.x - before.x, car.z - before.z) < 1e-8,
          'no invisible bumper on the open side',
        );
        for (let i = 0; i < 120 && !car.eliminated; i++) stepCar(car, NEUTRAL, STEP);
        assert.ok(car.falling && car.eliminated, 'a shove through the opening reaches the sea');
      } else {
        assert.ok(
          Math.hypot(car.x - before.x, car.z - before.z) > 0.5,
          'inside bumper pushes the chassis back',
        );
        assert.ok((car.vx * p.nx + car.vz * p.nz) * side <= 0, 'inside bumper reflects the impact');
      }
    }
  }
});
test('projectiles pass through the openings and hit the retained opposite bumpers', () => {
  selectTrack('coast');
  for (const gap of COAST_OUTER_GAPS) {
    const p = trackAt((gap.from + gap.to) / 2),
      origin = { x: p.x, y: p.y + 0.9, z: p.z };
    for (const side of [gap.side, -gap.side]) {
      const delta = {
        x: p.nx * (p.halfWidth + 3) * side,
        y: 0,
        z: p.nz * (p.halfWidth + 3) * side,
      };
      const hit = sweepTrackWalls(origin, delta);
      if (side === gap.side) assert.equal(hit, null);
      else assert.ok(hit !== null && hit >= 0 && hit <= 1);
    }
  }
});
test('new bumper openings do not add sand banks beneath the exposed road edges', () => {
  selectTrack('coast');
  const beaches = beachSegments({ segments: SEGMENTS, trackLength: TRACK_LENGTH, hasBarrier });
  for (const { a } of beaches) assert.ok(isCoastalBeach((a.start + a.len * 0.5) / TRACK_LENGTH));
  for (const gap of COAST_OUTER_GAPS) {
    const f = (gap.from + gap.to) / 2,
      p = trackAt(f);
    assert.equal(isCoastalBeach(f), false);
    assert.equal(
      getLandscape().surface.sample(
        p.x + p.nx * (p.halfWidth + 3) * gap.side,
        p.z + p.nz * (p.halfWidth + 3) * gap.side,
      ),
      null,
    );
  }
});
