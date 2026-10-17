import test from 'node:test';
import assert from 'node:assert/strict';
import { canReloadClient, createClientUpdates } from '../public/client-updates.js';

test('updates wait for a visible, connected, current lobby or completed tournament', () => {
  const menu = {
    hidden: false,
    connected: true,
    resuming: false,
    busy: false,
    session: null,
    state: null,
    fresh: true,
  };
  assert.equal(canReloadClient(menu), true);
  for (const block of [
    { hidden: true },
    { connected: false },
    { resuming: true },
    { busy: true },
    { session: {} },
  ])
    assert.equal(canReloadClient({ ...menu, ...block }), false);
  const room = { ...menu, session: { code: 'ABC' }, state: { phase: 'lobby' } };
  assert.equal(canReloadClient(room), true);
  assert.equal(
    canReloadClient({ ...room, fresh: false }),
    false,
    'background snapshots cannot authorize a reload',
  );
  for (const phase of ['racing', 'countdown', 'finished'])
    assert.equal(canReloadClient({ ...room, state: { phase } }), false);
  assert.equal(
    canReloadClient({ ...room, state: { phase: 'finished', tournamentComplete: true } }),
    true,
  );
});

test('an update found during a race reloads once when safe, preserving the running race', async () => {
  let safe = false,
    reloads = 0,
    notifications = 0;
  const updates = createClientUpdates({
    revision: 'old',
    fetcher: async (url, options) => {
      assert.equal(url, '/api/version');
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ revision: 'new' }) };
    },
    safe: () => safe,
    reload: () => reloads++,
    notify: () => notifications++,
  });
  await updates.check();
  await updates.check();
  assert.equal(reloads, 0);
  assert.equal(notifications, 1);
  safe = true;
  updates.apply();
  updates.apply();
  await updates.check();
  assert.equal(reloads, 1);
});

test('unchanged, failed, malformed and offline checks never reload', async () => {
  for (const fetcher of [
    async () => ({ ok: true, json: async () => ({ revision: 'same' }) }),
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => {
      throw Error('offline');
    },
  ]) {
    let reloads = 0;
    const updates = createClientUpdates({
      revision: 'same',
      fetcher,
      safe: () => true,
      reload: () => reloads++,
    });
    await updates.check();
    updates.apply();
    assert.equal(reloads, 0);
  }
});

test('overlapping resume and reconnect checks share a request and evaluate safety after it completes', async () => {
  let finish,
    calls = 0,
    safe = true,
    reloads = 0;
  const updates = createClientUpdates({
    revision: 'old',
    fetcher: () => {
      calls++;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    safe: () => safe,
    reload: () => reloads++,
  });
  const first = updates.check(),
    second = updates.check();
  assert.equal(first, second);
  assert.equal(calls, 1);
  safe = false;
  finish({ ok: true, json: async () => ({ revision: 'new' }) });
  await first;
  assert.equal(reloads, 0, 'a race that starts during the version request must not be interrupted');
  safe = true;
  updates.apply();
  assert.equal(reloads, 1);
});
