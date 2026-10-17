import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteSnapshots } from '../shared/remote-snapshots.js';
import {
  Samples,
  PREDICTION_GRACE_MS,
  INPUT_TIMEOUT_MS,
  replayWindow,
} from '../shared/network-timing.js';
import { ServerDiagnostics } from '../server-diagnostics.js';
const snapshot = (time, x = time * 0.03, angle = 0) => ({
  time,
  players: [
    {
      id: 'peer',
      x,
      y: 1,
      z: 0,
      angle,
      progress: x / 2000,
      renderVx: 30,
      renderProgress: 30 / 2000,
      eliminated: false,
    },
  ],
});
test('peers move smoothly through 180ms RTT and irregular packet arrivals at 30/60/120Hz', () => {
  for (const hz of [30, 60, 120]) {
    const buffer = new RemoteSnapshots(),
      packets = Array.from({ length: 150 }, (_, i) => ({
        state: snapshot(i * 50),
        arrival: i * 50 + 90 + [0, 12, 4, 25, 3, 8][i % 6],
      }));
    let packet = 0,
      last = null;
    const speeds = [];
    for (let now = 0; now < 6500; now += 1000 / hz) {
      while (packet < packets.length && packets[packet].arrival <= now) {
        const p = packets[packet++];
        buffer.push(p.state, p.arrival);
      }
      const pose = buffer.sample(now)?.[0];
      if (pose && last && now > 1000) speeds.push((pose.x - last.x) * hz);
      if (pose) last = pose;
    }
    assert.ok(Math.min(...speeds) > 23, 'no rewinding or recurring stops');
    assert.ok(Math.max(...speeds) < 37, 'no catch-up teleports');
    assert.ok(
      Math.sqrt(speeds.reduce((s, v) => s + (v - 30) ** 2, 0) / speeds.length) < 2,
      'small visible speed error',
    );
  }
});
test('remote playback extrapolates for at most 50ms and survives a 400ms delivery gap', () => {
  const b = new RemoteSnapshots();
  for (let t = 0; t <= 400; t += 50) b.push(snapshot(t), t + 100);
  let previous = -Infinity;
  for (let now = 500; now < 1200; now += 16) {
    if (now >= 900 && b.frames.at(-1).time === 400) b.push(snapshot(800), 900);
    const p = b.sample(now)[0];
    assert.ok(p.x >= previous);
    previous = p.x;
    if (now < 900) assert.ok(p.x <= 13.5);
  }
  assert.ok(b.underruns > 0);
  assert.ok(previous > 13.5);
});
test('remote interpolation takes the shortest rotation path and rejects duplicate timestamps', () => {
  const b = new RemoteSnapshots();
  b.push(snapshot(0, 0, Math.PI - 0.1), 100);
  b.push(snapshot(100, 3, -Math.PI + 0.1), 200);
  b.push(snapshot(100, 999), 210);
  assert.equal(b.frames.length, 2);
  const p = b.sample(250)[0];
  assert.ok(Math.abs(Math.abs(p.angle) - Math.PI) < 0.001);
  assert.equal(p.x, 1.5);
  b.reset();
  assert.equal(b.sample(300), null);
});
test('prediction covers brief network gaps but stays bounded during long stalls', () => {
  assert.ok(PREDICTION_GRACE_MS > 400 && PREDICTION_GRACE_MS <= 1000);
  assert.ok(INPUT_TIMEOUT_MS >= PREDICTION_GRACE_MS);
  const pending = Array.from({ length: 120 }, (_, seq) => ({ seq }));
  const replay = replayWindow(pending, 180);
  assert.ok(replay.length >= 16 && replay.length <= 18);
  assert.equal(replay.at(-1).seq, 119);
  assert.ok(replayWindow(pending, 10000).length <= 36);
});
test('diagnostic statistics are bounded and ignore invalid values', () => {
  const s = new Samples(3);
  for (const v of [10, 20, 30, 40, NaN, -1, Infinity]) s.add(v);
  assert.deepEqual(s.summary(), { count: 3, p50: 30, p95: 40, max: 40 });
  s.reset();
  assert.equal(s.summary().count, 0);
});
test('server logs accept only bounded numeric client metrics and rate-limit reports', () => {
  const d = new ServerDiagnostics(),
    logs = [],
    old = console.info;
  console.info = (...args) => logs.push(args);
  try {
    const c = { diagnosticId: 'test', room: { trackId: 'ice', phase: 'racing' } };
    d.client(
      c,
      { rttMs: 180, hidden: 0, token: 'secret', frameP95Ms: 'bad', gapMaxMs: Infinity },
      10000,
    );
    d.client(c, { rttMs: 999 }, 10001);
    assert.equal(logs.length, 1);
    const report = JSON.parse(logs[0][1]);
    assert.equal(report.rttMs, 180);
    assert.equal(report.token, undefined);
    assert.equal(report.frameP95Ms, undefined);
    assert.equal(report.gapMaxMs, undefined);
  } finally {
    console.info = old;
    d.close();
  }
});
