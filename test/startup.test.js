import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createStartup } from '../public/startup.js';
import { detectDevice } from '../public/display.js';
function fixture() {
  const events = [];
  let timeout;
  const startup = createStartup({
    view: {
      status: (message) => events.push(['status', message]),
      slow: (value) => events.push(['slow', value]),
      ready: () => events.push(['ready']),
      error: (message) => events.push(['error', message]),
    },
    delay: (fn) => {
      timeout = fn;
      return 1;
    },
    cancel: (id) => events.push(['cancel', id]),
  });
  return { startup, events, timeout: () => timeout() };
}
test('startup waits for both the first scene frame and server connection in either order', () => {
  for (const first of ['scene', 'server']) {
    const { startup, events } = fixture();
    if (first === 'scene') startup.sceneReady();
    else startup.connected(true);
    assert.equal(
      events.some((e) => e[0] === 'ready'),
      false,
    );
    if (first === 'scene') {
      assert.deepEqual(events[0], ['status', 'Connecting to the race server…']);
      startup.connected(true);
    } else startup.sceneReady();
    assert.equal(events.filter((e) => e[0] === 'ready').length, 1);
    startup.connected(false);
    startup.connected(true);
    startup.progress('Late stage');
    startup.sceneReady();
    assert.equal(
      events.filter((e) => e[0] === 'ready').length,
      1,
      'later reconnects must not reopen the initial loading screen',
    );
    assert.ok(events.some((e) => e[0] === 'cancel'));
  }
});
test('connection loss during startup keeps controls covered until reconnection', () => {
  const { startup, events, timeout } = fixture();
  startup.connected(true);
  startup.connected(false);
  startup.sceneReady();
  timeout();
  assert.equal(
    events.some((e) => e[0] === 'ready'),
    false,
  );
  assert.ok(events.some((e) => e[0] === 'slow' && e[1] === true));
  assert.ok(events.some((e) => e[0] === 'status' && /Still connecting/.test(e[1])));
  startup.connected(true);
  assert.equal(events.at(-1)[0], 'ready');
});
test('slow scene preparation keeps its real stage and exposes retry without failing the load', () => {
  const { startup, events, timeout } = fixture();
  startup.progress('Building terrain…');
  timeout();
  assert.deepEqual(events.filter((e) => e[0] === 'status').at(-1), ['status', 'Building terrain…']);
  assert.deepEqual(events.at(-1), ['slow', true]);
  startup.sceneReady();
  startup.connected(true);
  assert.equal(events.at(-1)[0], 'ready');
});
test('graphics and download failures remain visible despite late success signals', () => {
  const { startup, events, timeout } = fixture();
  startup.fail('Graphics unavailable');
  startup.fail('Generic import failure');
  startup.connected(true);
  startup.sceneReady();
  startup.progress('Late stage');
  timeout();
  assert.deepEqual(events, [
    ['cancel', 1],
    ['error', 'Graphics unavailable'],
  ]);
});
test('inline phone detection matches game detection before any game modules load', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html
    .match(/<script>\s*\/\/ Match detectDevice[\s\S]*?<\/script>/)[0]
    .replace(/^<script>|<\/script>$/g, '');
  for (const navigator of [
    { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5 },
    { userAgent: 'iPad', platform: 'iPad', maxTouchPoints: 5 },
    { userAgent: 'Android', platform: 'Linux', maxTouchPoints: 5 },
    { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 },
    { userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 5 },
  ]) {
    let mobile;
    runInNewContext(script, {
      navigator,
      document: {
        body: {
          classList: {
            toggle: (name, value) => {
              assert.equal(name, 'mobile');
              mobile = value;
            },
          },
        },
      },
    });
    assert.equal(mobile, detectDevice(navigator).mobile);
  }
});
