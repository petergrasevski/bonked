import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectTrack,
  spawnCar,
  stepCar,
  STEP,
  trackAt,
  botInput,
  botSteeringTarget,
  TRACK_LENGTH,
  angleDelta,
} from '../shared/game.js';
import { botControls } from '../shared/bots.js';
import { FACTORY_TABLES } from '../shared/extra-circuits.js';

function drive(track, difficulty, { slot = 0, start = 0, laps = 1 } = {}) {
  selectTrack(track);
  const p = { id: 'bot', botDifficulty: difficulty, car: spawnCar(slot) },
    room = { players: new Map(), raceTime: start, pickups: [], boostPads: [], mines: [] };
  room.players.set(p.id, p);
  p.car.raceTime = start;
  let ticks = 0,
    rotorTicks = 0;
  for (; ticks < 30000 && p.car.progress < laps && !p.car.eliminated; ticks++) {
    room.raceTime = start + ticks * STEP;
    if (track === 'factory' && Math.abs(p.car.trackFraction - FACTORY_TABLES[0]) < 0.025)
      rotorTicks++;
    stepCar(
      p.car,
      botControls(room, p, room.raceTime * 1000, () => 0.5),
    );
    p.car.raceTime += STEP;
  }
  assert.ok(
    p.car.progress >= laps,
    `${track} ${difficulty} slot ${slot}: stopped at ${p.car.progress}`,
  );
  assert.equal(p.car.health, 100, `${track} ${difficulty}: no damage`);
  assert.equal(p.car.falling, false);
  return { seconds: ticks * STEP, rotorSeconds: rotorTicks * STEP };
}

test('all difficulty profiles complete each circuit cleanly, with useful skill separation', () => {
  for (const track of ['coast', 'ice', 'desert', 'factory', 'volcano']) {
    const easy = drive(track, 'easy'),
      medium = drive(track, 'medium'),
      hard = drive(track, 'hard');
    assert.ok(
      medium.seconds < easy.seconds * 0.94,
      `${track}: medium ${medium.seconds} / easy ${easy.seconds}`,
    );
    assert.ok(
      hard.seconds < medium.seconds,
      `${track}: hard ${hard.seconds} / medium ${medium.seconds}`,
    );
    if (track === 'factory')
      assert.ok(
        hard.rotorSeconds < medium.rotorSeconds * 0.7,
        'outside route passes the rotor substantially faster',
      );
    if (track === 'volcano')
      assert.ok(
        medium.seconds < 56,
        'medium fully accelerates instead of retaining the old 24 m/s cap',
      );
  }
});

test('hard outer rotor route handles all grid slots and changing wall phases', () => {
  for (let slot = 0; slot < 8; slot++)
    for (const start of [0, 8, 20]) drive('factory', 'hard', { slot, start });
});

test('medium and hard target inside corner apexes while easy keeps its simpler line', () => {
  selectTrack('coast');
  let fraction = 0;
  for (let i = 0; i < 500; i++) {
    const f = i / 500,
      road = trackAt(f),
      ahead = trackAt(f + 24 / TRACK_LENGTH);
    if (Math.abs(angleDelta(ahead.angle, road.angle)) > 0.15) {
      fraction = f;
      break;
    }
  }
  const road = trackAt(fraction),
    car = {
      ...spawnCar(),
      x: road.x,
      z: road.z,
      angle: road.angle,
      trackFraction: fraction,
      vx: Math.cos(road.angle) * 30,
      vz: Math.sin(road.angle) * 30,
    };
  const easy = botSteeringTarget(car, { difficulty: 'easy' }),
    medium = botSteeringTarget(car, { difficulty: 'medium' }),
    hard = botSteeringTarget(car, { difficulty: 'hard' });
  assert.equal(easy.lane, 0);
  assert.ok(Math.abs(medium.lane) > 0.2);
  assert.ok(Math.abs(hard.lane) > Math.abs(medium.lane));
  assert.deepEqual(
    botInput(car),
    botInput(car, { difficulty: 'medium' }),
    'medium remains the default',
  );
  assert.deepEqual(
    botInput(car, { difficulty: 'invalid' }),
    botInput(car, { difficulty: 'medium' }),
  );
});
