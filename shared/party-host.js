import { sanitizeSkyAim } from './sky-beam.js';
import { createRoomEngine } from './room-engine.js';
import { STEP, NEUTRAL } from './game.js';
import { MAX_PLAYERS, PLAYER_GRACE_MS } from './session-limits.js';

// Connection/lifecycle adapter only. All game rules live in room-engine.js.
export function createPartyHost({ post, now = Date.now, graceMs = PLAYER_GRACE_MS }) {
  let room = null,
    accumulator = 0,
    tick = 0;
  const deliver = (id, message) => post({ type: 'deliver', id, message });
  const engine = createRoomEngine({
    now,
    send: (connection, message) => connection?.send(message),
    broadcast: (_, message) => post({ type: 'snapshot', state: { ...message, mode: 'lan' } }),
    onEmpty: (r) => engine.publish(r),
  });
  function handle(data) {
    const { type, id } = data;
    if (type === 'create') {
      if (room) return;
      room = {
        mode: 'lan',
        code: data.code || 'LOCAL',
        host: 'lan-display',
        trackId: 'coast',
        players: new Map(),
      };
      engine.resetRoom(room, { newTournament: true });
      post({ type: 'ready' });
      engine.publish(room);
      return;
    }
    if (!room) return;
    if (type === 'sky-aims') {
      if (room.phase === 'racing' && Array.isArray(data.aims))
        for (const { id, aim } of data.aims.slice(0, MAX_PLAYERS)) {
          const player = room.players.get(id);
          if (player?.car.eliminated && !player.bot && player.ws)
            player.skyAim = sanitizeSkyAim(aim);
        }
      return;
    }
    if (type === 'set-code') {
      room.code = data.code;
      engine.publish(room);
      return;
    }
    if (type === 'peer-open') {
      let player = room.players.get(id);
      if (player && !player.ws && now() - player.disconnectedAt > graceMs) {
        engine.removePlayer(room, player);
        player = null;
      }
      if (!player) {
        if (room.phase !== 'lobby')
          return deliver(id, { type: 'error', message: 'Return to the lobby to join this party.' });
        if (room.players.size >= MAX_PLAYERS)
          return deliver(id, { type: 'error', message: 'The grid is full.' });
        player = engine.addPlayer(room, null, data.name);
        room.players.delete(player.id);
        player.id = id;
        room.players.set(id, player);
      }
      player.ws = { readyState: 1, send: (message) => deliver(id, message) };
      player.disconnectedAt = null;
      player.input = { ...NEUTRAL };
      player.lastInput = now();
      deliver(id, { type: 'welcome', id, code: room.code, seq: player.seq });
      engine.publish(room);
      return;
    }
    const player = room.players.get(id);
    if (type === 'peer-close') {
      if (player) {
        player.ws = null;
        player.input = { ...NEUTRAL };
        player.disconnectedAt = now();
        engine.publish(room);
      }
      return;
    }
    if (type === 'peer-left') {
      if (player) engine.removePlayer(room, player);
      return;
    }
    if (type !== 'command') return;
    const msg = data.message,
      p = id === 'lan-display' ? { id } : player;
    if (!p || !msg || typeof msg !== 'object') return;
    if (
      id === 'lan-display' &&
      ![
        'ping',
        'start',
        'rematch',
        'lobby',
        'track',
        'game-type',
        'bot',
        'bot-difficulty',
        'remove-bot',
        'reset-scores',
      ].includes(msg.type)
    )
      return;
    if (id === 'lan-display' && ['start', 'rematch'].includes(msg.type) && !room.players.size)
      return deliver(id, {
        type: 'error',
        message: 'Join with a controller, connect a phone or add a bot first.',
      });
    if (id !== 'lan-display') {
      if (!p.ws) return;
      if (now() - (p.budgetAt || 0) > 1000) {
        p.budgetAt = now();
        p.budget = 0;
      }
      if ((p.budget = (p.budget || 0) + 1) > 150) return;
    }
    if (msg.type === 'ping') return deliver(id, { type: 'pong', sent: msg.sent, time: now() });
    engine.command(room, p, msg, now(), p.ws || { send: (message) => deliver(id, message) });
  }
  function advance(elapsed) {
    accumulator += Math.min(0.25, Math.max(0, elapsed));
    let advanced = false;
    while (room && accumulator >= STEP) {
      accumulator -= STEP;
      tick++;
      advanced = true;
      for (const p of room.players.values())
        if (!p.bot && !p.ws && now() - p.disconnectedAt > graceMs) engine.removePlayer(room, p);
      engine.step(room, now());
    }
    if (room && advanced)
      post({
        type: 'snapshot',
        state: { ...engine.snapshot(room), mode: 'lan' },
        controllers: tick % 3 === 0,
      });
  }
  return { handle, advance };
}
