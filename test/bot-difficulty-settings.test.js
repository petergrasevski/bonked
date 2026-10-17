import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoomEngine } from '../shared/room-engine.js';
import { createPartyHost } from '../shared/party-host.js';
import { assignBotDifficulty } from '../shared/bot-difficulty.js';

function setup() {
  const messages = [],
    engine = createRoomEngine({ send: (_, m) => messages.push(m) }),
    room = { code: 'TEST', trackId: 'coast', players: new Map() };
  engine.resetRoom(room, { newTournament: true });
  const host = engine.addPlayer(room, {}, 'Host'),
    guest = engine.addPlayer(room, {}, 'Guest');
  const command = (p, m) => engine.command(room, p, m, 0);
  return { engine, room, host, guest, command, messages };
}
test('host difficulty updates existing and future bots, survives resets and is in snapshots', () => {
  const { engine, room, host, command } = setup();
  command(host, { type: 'bot' });
  assert.equal([...room.players.values()].find((p) => p.bot).botDifficulty, 'medium');
  command(host, { type: 'bot-difficulty', difficulty: 'hard' });
  command(host, { type: 'bot' });
  assert.ok(
    [...room.players.values()].filter((p) => p.bot).every((p) => p.botDifficulty === 'hard'),
  );
  engine.resetRoom(room);
  const snapshot = engine.snapshot(room);
  assert.equal(snapshot.botDifficulty, 'hard');
  assert.ok(snapshot.players.filter((p) => p.bot).every((p) => p.botDifficulty === 'hard'));
  assert.ok(snapshot.players.filter((p) => !p.bot).every((p) => p.botDifficulty === undefined));
});
test('difficulty commands enforce host authority, valid choices and lobby phase', () => {
  const { room, host, guest, command, messages } = setup();
  command(guest, { type: 'bot-difficulty', difficulty: 'easy' });
  assert.equal(room.botDifficulty, undefined);
  assert.match(messages.at(-1).message, /host/);
  command(host, { type: 'bot-difficulty', difficulty: 'impossible' });
  assert.equal(room.botDifficulty, undefined);
  room.phase = 'racing';
  command(host, { type: 'bot-difficulty', difficulty: 'easy' });
  assert.equal(room.botDifficulty, undefined);
  assert.match(messages.at(-1).message, /lobby/);
});
test('mixed assigns a real level once per bot and preserves it between rounds', () => {
  assert.deepEqual(
    [0, 0.4, 0.99].map((r) => assignBotDifficulty('mixed', () => r)),
    ['easy', 'medium', 'hard'],
  );
  const { engine, room, host, command } = setup();
  command(host, { type: 'bot-difficulty', difficulty: 'mixed' });
  for (let i = 0; i < 4; i++) command(host, { type: 'bot' });
  const levels = [...room.players.values()].filter((p) => p.bot).map((p) => p.botDifficulty);
  assert.ok(levels.every((l) => ['easy', 'medium', 'hard'].includes(l)));
  engine.resetRoom(room, { advanceRound: true });
  assert.deepEqual(
    [...room.players.values()].filter((p) => p.bot).map((p) => p.botDifficulty),
    levels,
  );
});
test('LAN display can choose difficulty; phone players cannot override it', () => {
  let state;
  const host = createPartyHost({
    post: (m) => {
      if (m.type === 'snapshot') state = m.state;
    },
  });
  const command = (id, message) => host.handle({ type: 'command', id, message });
  host.handle({ type: 'create' });
  command('lan-display', { type: 'bot-difficulty', difficulty: 'easy' });
  command('lan-display', { type: 'bot' });
  assert.equal(state.botDifficulty, 'easy');
  assert.equal(state.players[0].botDifficulty, 'easy');
  host.handle({ type: 'peer-open', id: 'phone', name: 'Phone' });
  command('phone', { type: 'bot-difficulty', difficulty: 'hard' });
  assert.equal(state.botDifficulty, 'easy');
});
