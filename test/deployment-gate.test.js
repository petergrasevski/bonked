import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { networkInterfaces } from 'node:os';
import { WebSocket } from 'ws';
import { DeploymentGate, DEPLOY_PAUSE_MS } from '../server-deployment.js';
import { deployWhenIdle, gateRequest, WAIT_MS } from '../scripts/deploy-when-idle.mjs';
const owner = 'test-owner-12345678';

test('all room phases protect humans, including temporarily disconnected players; bots do not block', () => {
  for (const phase of ['lobby', 'countdown', 'racing', 'finished']) {
    let now = 1000;
    const player = { bot: false, ws: { readyState: 1 } };
    const rooms = new Map([
      [
        'ABC',
        {
          phase,
          players: new Map([
            ['human', player],
            ['bot', { bot: true, ws: { readyState: 1 } }],
          ]),
        },
      ],
    ]);
    const gate = new DeploymentGate({ rooms, graceMs: 20000, now: () => now });
    assert.equal(gate.acquire(owner).status, 409);
    assert.equal(gate.status().players, 1);
    player.ws = null;
    player.disconnectedAt = now;
    now += 20000;
    assert.equal(gate.acquire(owner).status, 409, 'the reconnect grace period is included');
    now++;
    assert.equal(gate.acquire(owner).status, 200);
    assert.equal(gate.status().players, 0);
  }
});
test('an empty server is paused atomically; only its owner can release; forgotten pauses expire', () => {
  let now = 0;
  const gate = new DeploymentGate({ rooms: new Map(), graceMs: 20000, now: () => now });
  assert.equal(gate.acquire(owner).status, 200);
  assert.equal(gate.status().paused, true);
  assert.equal(gate.acquire('other-owner-123456').status, 409);
  assert.equal(gate.release('other-owner-123456').paused, true);
  assert.equal(gate.release(owner).paused, false);
  gate.acquire(owner);
  now = DEPLOY_PAUSE_MS;
  assert.equal(gate.status().paused, false);
});
test('deployment waits, then deploys once and releases its pause', async () => {
  let now = 0,
    calls = 0,
    deployed = 0;
  const actions = [];
  const result = await deployWhenIdle({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    log: () => {},
    gate: async (action) => {
      actions.push(action);
      if (action === 'release') return {};
      return ++calls < 3
        ? { status: 409, body: { players: 2, occupiedRooms: 1 } }
        : { status: 200, body: { paused: true } };
    },
    deploy: async () => {
      deployed++;
    },
  });
  assert.equal(result, true);
  assert.equal(now, 60000);
  assert.equal(deployed, 1);
  assert.equal(actions.at(-1), 'release');
});
test('twenty minutes of occupied rooms defer deployment without restarting anything', async () => {
  let now = 0,
    calls = 0;
  const result = await deployWhenIdle({
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    log: () => {},
    gate: async () => {
      calls++;
      return { status: 409, body: { players: 1, occupiedRooms: 1 } };
    },
    deploy: async () => assert.fail('must never deploy'),
  });
  assert.equal(result, false);
  assert.equal(now, WAIT_MS);
  assert.equal(calls, 40);
});
test('deployment failures release the pause, while unavailable guards fail closed', async () => {
  const actions = [];
  await assert.rejects(
    deployWhenIdle({
      log: () => {},
      gate: async (action) => {
        actions.push(action);
        return { status: 200, body: { paused: true } };
      },
      deploy: async () => {
        throw Error('deploy failed');
      },
    }),
    /deploy failed/,
  );
  assert.deepEqual(actions, ['acquire', 'release']);
  for (const gate of [
    async () => ({ status: 404 }),
    async () => {
      throw Error('ssh failed');
    },
  ])
    await assert.rejects(
      deployWhenIdle({ log: () => {}, gate, deploy: async () => assert.fail('unsafe deployment') }),
    );
});

test(
  'loopback guard blocks room entry, rejects forwarded-header spoofing, and lets clients join after release',
  { timeout: 15000 },
  async (t) => {
    const port = 33240,
      base = `http://127.0.0.1:${port}`;
    const proc = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, PORT: String(port), HOST: '0.0.0.0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const clients = [];
    t.after(() => {
      for (const ws of clients) ws.terminate();
      proc.kill();
    });
    await Promise.race([
      once(proc.stdout, 'data'),
      once(proc, 'exit').then(() => {
        throw Error('Server failed');
      }),
    ]);
    const guard = (action) =>
      fetch(base + '/internal/deployment?action=' + action, {
        method: 'POST',
        headers: { 'x-deployment-owner': owner },
      });
    assert.equal((await guard('acquire')).status, 200);
    const external = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry.family === 'IPv4' && !entry.internal);
    if (external) {
      const denied = await fetch(`http://${external.address}:${port}/internal/deployment`, {
        headers: { 'X-Forwarded-For': '127.0.0.1' },
      });
      assert.equal(denied.status, 403);
    } else t.diagnostic('No non-loopback IPv4 interface available for proxy-spoofing check');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    clients.push(ws);
    await once(ws, 'open');
    let received = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'create', name: 'Driver' }));
    let msg = JSON.parse((await received)[0]);
    assert.equal(msg.reason, 'updating');
    assert.equal(msg.retryAfterMs, 2000);
    assert.equal((await (await fetch(base + '/health')).json()).rooms, 0);
    assert.equal((await guard('release')).status, 200);
    received = once(ws, 'message');
    ws.send(JSON.stringify({ type: 'create', name: 'Driver' }));
    msg = JSON.parse((await received)[0]);
    assert.equal(msg.type, 'welcome');
    const token = msg.token,
      code = msg.code;
    assert.equal((await guard('acquire')).status, 409);
    const ssh = await gateRequest('acquire', owner, {
      machine: 'test-machine',
      run: async (executable, args) => {
        assert.equal(executable, 'flyctl');
        assert.ok(args.includes('test-machine'));
        return promisify(execFile)('/bin/sh', ['-c', args.at(-1)], {
          env: { ...process.env, PORT: String(port) },
        });
      },
    });
    assert.equal(ssh.status, 409, 'the exact remote Node command runs correctly');
    ws.close();
    await once(ws, 'close');
    assert.equal((await guard('acquire')).status, 409, 'disconnects retain the reconnect grace');
    const rejoin = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    clients.push(rejoin);
    await once(rejoin, 'open');
    received = once(rejoin, 'message');
    rejoin.send(JSON.stringify({ type: 'join', code, token }));
    assert.equal(JSON.parse((await received)[0]).token, token);
  },
);
