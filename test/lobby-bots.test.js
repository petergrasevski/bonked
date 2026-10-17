import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (fn()) return;
    await sleep(10);
  }
  throw Error('Timed out');
}
test(
  'eight-car lobby removes only the chosen bot with host authority and safely reuses its grid slot',
  { timeout: 20000 },
  async (t) => {
    const port = 33225,
      proc = spawn(process.execPath, ['server.js'], {
        cwd: new URL('..', import.meta.url),
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      clients = [];
    t.after(() => {
      for (const c of clients) c.ws.terminate();
      proc.kill();
    });
    await Promise.race([
      once(proc.stdout, 'data'),
      once(proc, 'exit').then(() => {
        throw Error('Server failed');
      }),
    ]);
    async function connect() {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`),
        c = { ws, messages: [], send: (m) => ws.send(JSON.stringify(m)) };
      clients.push(c);
      ws.on('message', (data) => {
        const m = JSON.parse(data);
        c.messages.push(m);
        if (m.type === 'welcome') c.welcome = m;
        if (m.type === 'state') c.state = m;
      });
      await once(ws, 'open');
      return c;
    }
    const host = await connect();
    host.send({ type: 'create' });
    await until(() => host.welcome && host.state);
    const guest = await connect();
    guest.send({ type: 'join', code: host.welcome.code });
    await until(() => guest.welcome);
    for (let i = 0; i < 6; i++) host.send({ type: 'bot' });
    await until(() => host.state.players.length === 8);
    const original = host.state.players.map((p) => p.id),
      bot = host.state.players.filter((p) => p.bot)[2];
    guest.send({ type: 'remove-bot', playerId: bot.id });
    await until(() => guest.messages.some((m) => m.type === 'error'));
    assert.equal(host.state.players.length, 8);
    host.send({ type: 'remove-bot', playerId: guest.welcome.id });
    await until(() => host.messages.some((m) => m.message === 'Choose a bot to remove.'));
    assert.equal(host.state.players.length, 8);
    host.send({ type: 'remove-bot', playerId: bot.id });
    await until(() => host.state.players.length === 7);
    assert.deepEqual(
      host.state.players.map((p) => p.id),
      original.filter((id) => id !== bot.id),
    );
    host.send({ type: 'bot' });
    await until(() => host.state.players.length === 8);
    assert.equal(new Set(host.state.players.map((p) => p.gridSlot)).size, 8);
    assert.equal(new Set(host.state.players.map((p) => p.color)).size, 8);
    host.send({ type: 'start' });
    await until(() => host.state.phase === 'countdown');
    host.send({ type: 'remove-bot', playerId: host.state.players.find((p) => p.bot).id });
    await sleep(100);
    assert.equal(host.state.players.length, 8);
  },
);
