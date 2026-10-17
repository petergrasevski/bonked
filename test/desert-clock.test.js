import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 700; i++) {
    if (fn()) return;
    await sleep(10);
  }
  throw Error('Timed out waiting for race clock');
}
test(
  'desert hazards use an authoritative per-round clock shared by all cars and isolated between rooms',
  { timeout: 12000 },
  async (t) => {
    const port = 33224,
      proc = spawn(process.execPath, ['server.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      clients = [];
    t.after(() => {
      clients.forEach((c) => c.ws.terminate());
      proc.kill();
    });
    await Promise.race([
      once(proc.stdout, 'data'),
      once(proc, 'exit').then(() => {
        throw Error('Server failed');
      }),
    ]);
    assert.equal((await fetch(`http://127.0.0.1:${port}/shared/desert-features.js`)).status, 200);
    async function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`),
        c = { ws, send: (m) => ws.send(JSON.stringify(m)) };
      clients.push(c);
      ws.on('message', (data) => {
        const m = JSON.parse(data);
        if (m.type === 'state') c.state = m;
        if (m.type === 'welcome') c.welcome = m;
      });
      await once(ws, 'open');
      return c;
    }
    const a = await connect();
    a.send({ type: 'create', trackId: 'desert' });
    await until(() => a.state && a.welcome);
    const b = await connect();
    b.send({ type: 'join', code: a.welcome.code });
    const idle = await connect();
    idle.send({ type: 'create', trackId: 'coast' });
    await until(() => a.state.players.length === 2 && idle.state);
    assert.equal(a.state.raceTime, 0);
    a.send({ type: 'start' });
    await until(() => a.state.phase === 'countdown');
    assert.equal(a.state.raceTime, 0);
    a.send({ type: 'input', seq: 1, raceTime: 9999, throttle: 0 });
    await until(() => a.state.phase === 'racing' && a.state.raceTime > 0.25);
    assert.ok(a.state.raceTime < 2, 'client cannot override the simulation clock');
    for (const p of a.state.players)
      assert.equal(p.raceTime, a.state.raceTime, 'all cars collide against the same mole phase');
    const before = a.state.raceTime;
    await until(() => a.state.raceTime > before + 0.12);
    assert.ok(
      Math.abs(a.state.raceTime * 60 - Math.round(a.state.raceTime * 60)) < 1e-8,
      'clock advances in fixed simulation ticks',
    );
    assert.equal(idle.state.raceTime, 0, "another room does not advance this room's hazards");
    assert.ok(
      Math.abs(a.state.raceTime - b.state.raceTime) < 0.11,
      'both clients receive the same race timeline',
    );
  },
);
