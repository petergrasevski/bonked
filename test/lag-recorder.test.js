import test from 'node:test';
import assert from 'node:assert/strict';
import { LagRecorder, createLagReportUI } from '../public/lag-recorder.js';
import { ServerDiagnostics } from '../server-diagnostics.js';

test('recorder retains recent pre-click history, prunes on idle, and bounds bursts', () => {
  let now = 0;
  const r = new LagRecorder({ now: () => now, wall: () => 0 });
  for (now = 0; now <= 40000; now += 50) r.add('snapshot', { ack: now });
  const report = r.capture();
  assert.ok(report.events.length > 590);
  assert.ok(report.events.every((e) => e.t >= now - 30000));
  for (let i = 0; i < 5000; i++) r.add('snapshot', { ack: i });
  assert.equal(r.events.length, 1200);
  now += 31000;
  assert.deepEqual(r.capture().events, []);
  assert.equal(report.events[0].ack, report.events[0].t);
});
test('frame samples include worst stalls and moving peers without retaining identity secrets', () => {
  let now = 0;
  const r = new LagRecorder({ now: () => now });
  const car = { id: 'peer', name: 'Private name', token: 'secret', x: 1, z: 2, vx: 30 };
  const frame = { frameMs: 16, age: 20, phase: 'racing', players: [car], predicted: [car] };
  r.frame(frame);
  now = 20;
  r.frame({ ...frame, frameMs: 200 });
  now = 100;
  r.frame(frame);
  const e = r.capture().events.at(-1);
  assert.equal(e.frameMaxMs, 200);
  assert.equal(e.discardedMs, 150);
  assert.equal(e.frames, 2);
  car.x = 999;
  assert.equal(e.cars[0].x, 1);
  assert.doesNotMatch(JSON.stringify(e), /Private name|secret/);
});
function ui(send = () => true, storage = new Map()) {
  const button = {},
    download = {
      clicks: 0,
      click() {
        this.clicks++;
      },
    },
    status = {};
  const persistence = { setItem: (k, v) => storage.set(k, v), getItem: (k) => storage.get(k) };
  const controller = createLagReportUI({
    recorder: new LagRecorder(),
    send,
    button,
    download,
    status,
    context: () => ({ revision: 'test' }),
    storage: persistence,
  });
  return { button, download, status, controller, storage };
}
test('report freezes at click, correlates server reply and restores the download after reload', () => {
  let request;
  const u = ui((m) => {
    request = m;
    return true;
  });
  u.button.onclick();
  assert.equal(u.button.disabled, true);
  u.controller.receive({ type: 'lag-report', id: 'unrelated', capture: { status: 'captured' } });
  assert.equal(u.download.clicks, 0);
  u.controller.receive({
    type: 'lag-report',
    id: request.id,
    capture: { status: 'captured', history: [{ tickHz: 60 }] },
  });
  assert.equal(u.download.clicks, 1);
  assert.equal(u.button.disabled, false);
  const saved = JSON.parse([...u.storage.values()][0]);
  assert.equal(saved.serverCapture.history[0].tickHz, 60);
  const restored = ui(() => true, u.storage);
  assert.equal(restored.download.hidden, false);
  assert.equal(restored.download.clicks, 0);
});
test('offline and timeout paths still export local diagnostics and unlock the button', (t) => {
  const offline = ui(() => false);
  offline.button.onclick();
  assert.equal(offline.download.clicks, 1);
  assert.match(offline.status.textContent, /unavailable/);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const timeout = ui();
  timeout.button.onclick();
  t.mock.timers.tick(2500);
  assert.equal(timeout.download.clicks, 1);
  assert.equal(timeout.button.disabled, false);
  assert.equal(JSON.parse([...timeout.storage.values()][0]).serverCapture.status, 'timeout');
});
test('server incident correlates recent windows, rate limits, deduplicates and excludes client supplied data', () => {
  const d = new ServerDiagnostics(),
    old = console.info,
    logs = [];
  console.info = (...v) => logs.push(v);
  try {
    d.history = [
      { at: 1, tickHz: 60 },
      { at: 20000, tickHz: 59.9 },
    ];
    const c = {
      diagnosticId: 'anon',
      room: { trackId: 'ice', phase: 'racing', round: 2, name: 'secret' },
    };
    assert.equal(d.incident(c, 'invalid', 'build', 40000), null);
    const id = '11111111-1111-1111-1111-111111111111',
      result = d.incident(c, id, 'build', 40000);
    assert.equal(result.history.length, 1);
    assert.equal(result.revision, 'build');
    assert.equal(d.incident(c, id, 'build', 40001), result);
    assert.equal(
      d.incident(c, '22222222-2222-2222-2222-222222222222', 'build', 40001).status,
      'rate-limited',
    );
    assert.equal(logs.length, 2);
    assert.doesNotMatch(JSON.stringify(logs), /secret/);
    assert.equal(d.incident({}, id, 'build', 40000).status, 'no-room');
  } finally {
    console.info = old;
    d.close();
  }
});
