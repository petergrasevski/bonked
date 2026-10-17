import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalPresentation } from '../public/local-presentation.js';
const state = (tick, x, { phase = 'racing', round = 1, angle = 0, eliminated = false } = {}) => ({
  phase,
  round,
  trackId: 'coast',
  startAt: 0,
  simulationTick: tick,
  raceTime: tick / 60,
  players: [
    {
      id: 'phone',
      x,
      y: 0,
      z: 0,
      angle,
      pitch: 0,
      roll: 0,
      progress: x / 100,
      health: 100,
      eliminated,
    },
  ],
});
test('LAN display interpolates between fixed ticks on 120 Hz screens without changing authority', () => {
  const view = new LocalPresentation({ delayMs: 25 });
  let s;
  for (let tick = 0; tick < 4; tick++) {
    s = state(tick, tick);
    view.push(s, 100 + (tick * 1000) / 60);
  }
  const xs = [150, 150 + 1000 / 120, 150 + 2000 / 120].map(
    (now) => view.render(s, now).players[0].x,
  );
  assert.ok(Math.abs(xs[0] - 1.5) < 1e-10);
  assert.ok(Math.abs(xs[1] - 2) < 1e-10);
  assert.ok(Math.abs(xs[2] - 2.5) < 1e-10);
  assert.equal(s.players[0].x, 3);
  assert.equal(s.players[0].health, 100);
  assert.equal(
    view.render(s, 5000).players[0].x,
    3,
    'stale worker never extrapolates indefinitely',
  );
});
test('LAN presentation wraps angles, keeps current gameplay metadata and resets between rounds', () => {
  const view = new LocalPresentation({ delayMs: 25 }),
    a = state(0, 0, { angle: Math.PI - 0.1 }),
    b = state(1, 1, { angle: -Math.PI + 0.1 });
  view.push(a, 100);
  view.push(b, 100 + 1000 / 60);
  b.players[0].health = 30;
  const shown = view.render(b, 100 + 25 + 1000 / 120);
  assert.ok(Math.abs(shown.players[0].angle - Math.PI) < 1e-10);
  assert.equal(shown.players[0].health, 30);
  const next = state(2, 70, { round: 2 });
  view.push(next, 150);
  assert.equal(view.render(next, 150), next);
  const lobby = state(3, 20, { phase: 'lobby', round: 2 });
  view.push(lobby, 170);
  assert.equal(view.render(lobby, 170), lobby);
});
test('LAN presentation snaps teleports and elimination changes, accepts same-tick roster publications', () => {
  const view = new LocalPresentation(),
    a = state(0, 0),
    b = state(1, 50);
  view.push(a, 100);
  view.push(b, 117);
  assert.equal(view.render(b, 120).players[0].x, 50);
  const eliminated = state(1, 0, { eliminated: true });
  view.push(eliminated, 118);
  assert.equal(view.frames.length, 2);
  assert.equal(view.render(eliminated, 125).players[0].eliminated, true);
});
