import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  spawnCar,
  stepCar,
  damageCar,
  NEUTRAL,
  constrainRoad,
  PICKUP_LOCATIONS,
} from '../shared/game.js';
import { ARENA_SPAWNS, ARENA_PICKUPS, arenaSurface } from '../shared/arena.js';
import { createRoomEngine } from '../shared/room-engine.js';
import { sweepTrackWalls } from '../shared/weapon-geometry.js';
import { skyGroundAt, skyRayGround } from '../shared/sky-ground.js';
import { stepPersonalCamera, cameraPose } from '../shared/camera.js';
import { readCameraView, saveCameraView } from '../public/camera-settings.js';
function fixture() {
  let serial = 0;
  const errors = [];
  const engine = createRoomEngine({
    randomUUID: () => String(++serial),
    randomBytes: (n) => new Uint8Array(n),
    send: (_, m) => errors.push(m),
  });
  const room = { code: 'TEST', trackId: 'coast', players: new Map() };
  engine.resetRoom(room, { newTournament: true });
  const host = engine.addPlayer(room, {}, 'Host');
  const guest = engine.addPlayer(room, {}, 'Guest');
  return { engine, room, host, guest, errors };
}
test('selecting an arena tile changes rules atomically and preserves host authority', () => {
  const { engine, room, host, guest, errors } = fixture();
  engine.command(room, guest, { type: 'track', trackId: 'cafe' }, 0);
  assert.equal(room.trackId, 'coast');
  engine.command(room, host, { type: 'track', trackId: 'cafe' }, 0);
  assert.equal(room.trackId, 'cafe');
  assert.equal(engine.snapshot(room).gameType, 'battle-arena');
  assert.equal(room.pickups.length, 15);
  assert.equal(host.car.health, 100);
  assert.equal(host.car.balloons, undefined);
  host.score = 5;
  engine.command(room, host, { type: 'track', trackId: 'ice' }, 0);
  assert.equal(room.gameType, 'battle-race');
  assert.equal(host.score, 0);
  assert.equal(errors.length, 1);
});
test('fifteen distinct spawns and pickups, safe eight-car starts', () => {
  selectTrack('cafe');
  assert.equal(ARENA_SPAWNS.length, 15);
  assert.equal(ARENA_PICKUPS.length, 15);
  assert.equal(PICKUP_LOCATIONS.length, 15);
  const cars = Array.from({ length: 8 }, (_, i) => spawnCar(i));
  for (const c of cars) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z));
    constrainRoad(c);
    assert.equal(c.y, 0);
    for (let i = 0; i < 120; i++) stepCar(c, { ...NEUTRAL, throttle: 1 });
    assert.ok(Number.isFinite(c.x));
    assert.equal(c.eliminated, false);
    assert.equal(c.health, 100);
    assert.ok(Math.abs(c.x) < 80 && Math.abs(c.z) < 80);
  }
});
test('arena weapons use their normal health damage with no balloon immunity', async () => {
  const { giveWeapon, pressWeapon } = await import('../shared/combat.js');
  const { engine, room, host, guest } = fixture();
  engine.command(room, host, { type: 'track', trackId: 'cafe' }, 0);
  room.phase = 'racing';
  room.startAt = 0;
  Object.assign(host.car, { x: -60, z: 0, y: 0, angle: 0 });
  Object.assign(guest.car, { x: -10, z: 0, y: 0 });
  giveWeapon(host.car, 'railgun');
  pressWeapon(room, host, 100);
  assert.equal(guest.car.health, 25);
  assert.equal(guest.car.eliminated, false);
  damageCar(guest.car, 25);
  assert.equal(guest.car.health, 0);
  assert.equal(guest.car.eliminated, true);
});
test('ramps climb continuously, decks support cars and falls land on the floor', () => {
  selectTrack('cafe');
  const c = spawnCar();
  Object.assign(c, { x: -34, z: -64, y: 0, groundY: 0, angle: Math.PI / 2 });
  for (let i = 0; i <= 48; i++) {
    c.z = -64 + i * 0.5;
    constrainRoad(c);
  }
  assert.ok(Math.abs(c.y - 8) < 0.1);
  Object.assign(c, { x: -34, z: -25, y: 8, groundY: 8 });
  constrainRoad(c);
  assert.equal(c.y, 8);
  c.x = -10;
  constrainRoad(c);
  assert.equal(c.groundY, 0);
  assert.equal(c.y, 8);
  for (let i = 0; i < 120; i++) stepCar(c, NEUTRAL);
  assert.equal(c.y, 0);
  assert.equal(c.eliminated, false);
  assert.equal(arenaSurface(0, 0).y, 16);
});
test('cover blocks projectiles at its actual height and sky beams target raised floors', () => {
  selectTrack('cafe');
  assert.notEqual(sweepTrackWalls({ x: -60, y: 1, z: -25 }, { x: 50, y: 0, z: 0 }), null);
  assert.equal(sweepTrackWalls({ x: -60, y: 20, z: -25 }, { x: 50, y: 0, z: 0 }), null);
  assert.equal(skyGroundAt(0, 0).y, 16);
  assert.equal(skyRayGround({ x: 0, y: 100, z: 0 }, { x: 0, y: -1, z: 0 }).y, 16);
});
test('arena ignores circuit finish and death line, and ends when health reaches zero', () => {
  const { engine, room, host, guest } = fixture();
  engine.command(room, host, { type: 'game-type', gameType: 'battle-arena' }, 0);
  engine.startRound(room, 0);
  host.car.progress = 100;
  engine.step(room, 3400);
  assert.equal(host.car.finished, false);
  assert.equal(host.car.eliminated, false);
  damageCar(guest.car, 100);
  engine.step(room, 3500);
  engine.step(room, 5500);
  assert.equal(room.phase, 'finished');
  assert.equal(room.winnerId, host.id);
});
test('personal camera follows only its car, behind its heading, and persists preferences', () => {
  const c = { x: 12, y: 8, z: 20, angle: 0 };
  const frame = stepPersonalCamera(null, c, 1 / 60),
    pose = cameraPose(frame);
  assert.ok(pose.x < c.x);
  assert.equal(pose.z, c.z);
  assert.ok(pose.y > c.y);
  const next = stepPersonalCamera(frame, { ...c, angle: Math.PI / 2 }, 1 / 60);
  assert.ok(next.angle > 0 && next.angle < Math.PI / 2);
  const values = new Map(),
    storage = { getItem: (k) => values.get(k), setItem: (k, v) => values.set(k, v) };
  assert.equal(readCameraView(storage), 'shared');
  saveCameraView(storage, 'personal');
  assert.equal(readCameraView(storage), 'personal');
  assert.equal(
    readCameraView({
      getItem: () => {
        throw Error();
      },
    }),
    'shared',
  );
});

test('all pickup locations are on reachable ground or ramp-accessible decks', () => {
  selectTrack('cafe');
  for (const p of ARENA_PICKUPS) assert.equal(arenaSurface(p.x, p.z).y, p.y);
});
test('railgun cover blocks health damage but exposed opponents take normal damage', async () => {
  const { giveWeapon, pressWeapon, updateCombat } = await import('../shared/combat.js');
  const { engine, room, host, guest } = fixture();
  engine.command(room, host, { type: 'game-type', gameType: 'battle-arena' }, 0);
  room.phase = 'racing';
  room.startAt = 0;
  Object.assign(host.car, { x: -60, z: -25, y: 0, angle: 0 });
  Object.assign(guest.car, { x: -10, z: -25, y: 0, angle: 0 });
  giveWeapon(host.car, 'railgun');
  pressWeapon(room, host, 100);
  assert.equal(guest.car.health, 100);
  Object.assign(host.car, { x: -60, z: 0 });
  Object.assign(guest.car, { x: -10, z: 0 });
  giveWeapon(host.car, 'railgun');
  pressWeapon(room, host, 200);
  assert.equal(guest.car.health, 25);
});

test('local parties reject arena selection while keeping ordinary tracks available', async () => {
  const { createPartyHost } = await import('../shared/party-host.js');
  const messages = [];
  const host = createPartyHost({ post: (m) => messages.push(m), now: () => 100 });
  host.handle({ type: 'create' });
  host.handle({ type: 'command', id: 'lan-display', message: { type: 'track', trackId: 'cafe' } });
  host.handle({
    type: 'command',
    id: 'lan-display',
    message: { type: 'game-type', gameType: 'battle-arena' },
  });
  let snapshot = messages.filter((m) => m.type === 'snapshot').at(-1).state;
  assert.equal(snapshot.trackId, 'coast');
  assert.equal(
    messages.filter((m) => m.type === 'deliver' && m.message.type === 'error').length,
    2,
  );
  host.handle({ type: 'command', id: 'lan-display', message: { type: 'track', trackId: 'ice' } });
  snapshot = messages.filter((m) => m.type === 'snapshot').at(-1).state;
  assert.equal(snapshot.trackId, 'ice');
});

test('arena sky beams push without reducing health', async () => {
  const { updateSkyBeams } = await import('../shared/sky-beam.js');
  const { engine, room, host, guest } = fixture();
  engine.command(room, host, { type: 'track', trackId: 'cafe' }, 0);
  room.phase = 'racing';
  room.startAt = 0;
  host.car.eliminated = true;
  Object.assign(guest.car, { x: 1, y: 16, z: 0 });
  host.skyAim = { x: 0, z: 0 };
  host.simInput = { fire: false };
  updateSkyBeams(room, 100);
  host.simInput.fire = true;
  updateSkyBeams(room, 200);
  assert.equal(room.skyBeams.length, 1);
  assert.equal(room.skyBeams[0].y, 16);
  updateSkyBeams(room, 800);
  assert.equal(guest.car.health, 100);
  assert.ok(guest.car.vx > 0);
});
