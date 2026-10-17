import { safeGridStartFraction, randomGridSlots } from './starting-grid.js';
import { botControls } from './bots.js';
import { BOT_DIFFICULTY_MODES, assignBotDifficulty } from './bot-difficulty.js';
import { updateSkyBeams, sanitizeSkyAim, resetSkyBeams } from './sky-beam.js';
import { captureMotion, recordMotion } from './prediction.js';
import { collectBoostPad } from './boost-pads.js';
import {
  TRACKS,
  selectTrack,
  BOOST_PADS,
  MAX_PLAYERS,
  LAPS,
  STEP,
  COLORS,
  COLOR_NAMES,
  NEUTRAL,
  spawnCar,
  stepCar,
  collideCoastalCrabs,
  collideDesertMoles,
  collideCars,
  resolveNudges,
  sanitizeInput,
  recordLaunchInput,
  applyLaunch,
  START_FRACTION,
  constrainRoad,
  updateFactoryMechanics,
} from './game.js';
import { createChase, updateChase, chaseSnapshot, cameraFrame } from './chase.js';
import {
  awardArenaKill,
  initCombat,
  createPickups,
  collectPickup,
  pressWeapon,
  updateCombat,
} from './combat.js';
import { targetScoreForPlayers, scoreRound, nextRoundDue } from './tournament.js';
import { INPUT_TIMEOUT_MS } from './network-timing.js';

// One authoritative engine for Node rooms and browser-hosted LAN parties.
// Transports provide connections, identity generation, delivery and room cleanup.
export function createRoomEngine({
  send = () => {},
  broadcast = () => {},
  onEmpty = () => {},
  stats = {},
  randomUUID = () => crypto.randomUUID(),
  randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n)),
  now = Date.now,
} = {}) {
  const fail = (ws, message, requestId) =>
    send(ws, {
      type: 'error',
      message,
      ...(typeof requestId === 'string' ? { requestId: requestId.slice(0, 80) } : {}),
    });
  function snapshot(room) {
    return {
      skyBeams: room.skyBeams || [],
      type: 'state',
      code: room.code,
      trackId: room.trackId || 'coast',
      gameType: room.gameType || 'battle-race',
      botDifficulty: room.botDifficulty || 'medium',
      host: room.host,
      phase: room.phase,
      simulationTick: room.simulationTick || 0,
      raceTime: room.raceTime || 0,
      time: now(),
      startAt: room.startAt,
      endedAt: room.endedAt,
      finishedAt: room.finishedAt,
      winnerId: room.winnerId,
      round: room.round,
      roundStartFraction: room.roundStartFraction,
      targetScore: room.targetScore,
      roundResults: room.roundResults,
      nextRoundAt: room.nextRoundAt,
      tournamentComplete: room.tournamentComplete,
      tournamentWinnerId: room.tournamentWinnerId,
      chase: chaseSnapshot(room.chase),
      camera: cameraFrame(
        room.chase,
        [...room.players.values()].map((p) => p.car),
      ),
      players: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        colorName: p.colorName,
        connected: !!p.ws,
        bot: p.bot,
        botDifficulty: p.bot ? p.botDifficulty : undefined,
        botRequestId: p.botRequestId,
        score: p.score || 0,
        ready: !!p.ready,
        seq: p.appliedSeq ?? 0,
        input: (room.phase === 'countdown' ? p.input : p.simInput) || NEUTRAL,
        fireLatch: !!p.fireLatch,
        skyTarget: p.skyTarget || null,
        skyCooldownUntil: p.skyCooldownUntil || 0,
        ...p.car,
      })),
      boostPads: room.boostPads.map(({ id, readyAt }) => ({ id, readyAt })),
      pickups: room.pickups,
      projectiles: room.projectiles,
      effects: room.effects,
      mines: room.mines,
      chains: room.chains,
      arcs: room.arcs,
      sounds: room.sounds,
      pulses: room.pulses,
    };
  }
  function publish(room) {
    selectTrack(room.trackId);
    if (room.phase === 'lobby') room.targetScore = targetScoreForPlayers(room.players.size);
    if (room.phase === 'lobby')
      room.chase = createChase([...room.players.values()].map((p) => p.car));
    broadcast(room, snapshot(room));
  }
  function resetRoom(
    room,
    {
      newTournament = false,
      advanceRound = false,
      startFraction = START_FRACTION,
      randomizeGrid = false,
    } = {},
  ) {
    room.gameType = room.trackId === 'cafe' ? 'battle-arena' : 'battle-race';
    selectTrack(room.trackId);
    startFraction = safeGridStartFraction(startFraction, room.players.size);
    room.phase = 'lobby';
    room.simulationTick = 0;
    room.raceTime = 0;
    room.startAt = null;
    room.endedAt = null;
    room.finishedAt = null;
    initCombat(room);
    room.survivorEndAt = null;
    room.pickups = createPickups();
    room.boostPads = BOOST_PADS.map((p) => ({ ...p }));
    if (newTournament) room.targetScore = targetScoreForPlayers(room.players.size);
    room.round = newTournament ? 1 : (room.round || 1) + (advanceRound ? 1 : 0);
    room.roundStartFraction = startFraction;
    room.finishProgress = startFraction - START_FRACTION + LAPS;
    room.roundResults = [];
    room.nextRoundAt = null;
    room.tournamentComplete = false;
    room.tournamentWinnerId = null;
    resetSkyBeams(room);
    const slots = randomizeGrid
      ? randomGridSlots(room.gameType === 'battle-arena' ? 15 : room.players.size)
      : Array.from({ length: room.players.size }, (_, i) => i);
    let index = 0;
    for (const p of room.players.values()) {
      p.car = spawnCar(slots[index++], startFraction);
      constrainRoad(p.car);
      p.input = { ...NEUTRAL };
      p.simInput = { ...NEUTRAL };
      p.fireLatch = false;
      p.botState = null;
      p.accelPressedAt = null;
      p.ready = false;
      p.appliedSeq = p.seq;
      if (newTournament) p.score = 0;
      p.roundStartScore = p.score || 0;
      p.roundKills = 0;
    }
    room.chase = createChase([...room.players.values()].map((p) => p.car));
    room.raceSize = room.players.size;
    room.winnerId = null;
  }
  function startRound(room, now, next = false) {
    resetRoom(room, {
      newTournament: !!room.tournamentComplete,
      advanceRound: next,
      startFraction: next ? room.nextStartFraction : START_FRACTION,
      randomizeGrid: true,
    });
    room.phase = 'countdown';
    room.startAt = now + 3300;
    publish(room);
  }
  function addPlayer(room, ws, name, bot = false) {
    selectTrack(room.trackId);
    const used = new Set([...room.players.values()].map((p) => p.color));
    const options = COLORS.filter((c) => !used.has(c)),
      color = options[Math.floor(Math.random() * options.length)];
    const p = {
      id: randomUUID(),
      token: Array.from(randomBytes(24), (b) => b.toString(16).padStart(2, '0')).join(''),
      name:
        String(name || 'Driver')
          .trim()
          .slice(0, 18) || 'Driver',
      color,
      colorName: COLOR_NAMES[COLORS.indexOf(color)],
      car: spawnCar(
        Array.from({ length: MAX_PLAYERS }, (_, i) => i).find(
          (slot) => ![...room.players.values()].some((p) => p.car.gridSlot === slot),
        ),
      ),
      ws,
      bot,
      botDifficulty: bot ? assignBotDifficulty(room.botDifficulty) : undefined,
      score: 0,
      ready: false,
      input: { ...NEUTRAL },
      seq: 0,
      lastInput: now(),
      disconnectedAt: null,
    };
    room.players.set(p.id, p);
    if (!room.host && !bot) room.host = p.id;
    return p;
  }
  function removePlayer(room, p) {
    p.voice?.close(1000, 'Left lobby');
    room.players.delete(p.id);
    if (room.host === p.id)
      room.host =
        [...room.players.values()].find((p) => !p.bot && p.ws)?.id ||
        [...room.players.values()].find((p) => !p.bot)?.id;
    if (![...room.players.values()].some((p) => !p.bot)) {
      onEmpty(room);
      return;
    }
    publish(room);
  }
  function useItem(room, p, now) {
    return pressWeapon(room, p, now);
  }

  function command(room, p, msg, now, ws = p?.ws) {
    selectTrack(room.trackId);
    if (msg.type === 'input') {
      if (!Number.isSafeInteger(msg.seq) || msg.seq <= p.seq || msg.seq - p.seq > 10000) return;
      const next = sanitizeInput(msg);
      if (room.phase === 'countdown')
        recordLaunchInput(p, next, msg.accelPressedAt, now, room.startAt);
      stats.inputGaps?.add(now - p.lastInput);
      p.seq = msg.seq;
      p.skyAim = sanitizeSkyAim(msg.skyAim);
      p.input = next;
      p.lastInput = now;
      return;
    }
    if (msg.type === 'item') return useItem(room, p, now);
    if (msg.type === 'leave') {
      removePlayer(room, p);
      return send(ws, { type: 'left' });
    }
    if (msg.type === 'ready') {
      if (room.phase === 'finished' && !room.tournamentComplete && msg.round === room.round) {
        p.ready = true;
        publish(room);
      }
      return;
    }
    if (p.id !== room.host) return fail(ws, 'Only the room host can do that.', msg.requestId);
    if (msg.type === 'lobby') {
      if (room.phase !== 'lobby')
        resetRoom(room, {
          newTournament: !!room.tournamentComplete,
          advanceRound: room.phase === 'finished' && !room.tournamentComplete,
        });
      publish(room);
      return;
    }
    if (msg.type === 'reset-scores' && room.phase === 'lobby') {
      resetRoom(room, { newTournament: true });
      publish(room);
      return;
    }
    if (msg.type === 'game-type' && room.phase === 'lobby') {
      if (room.mode === 'lan' && msg.gameType === 'battle-arena')
        return fail(
          ws,
          'Battle Arena needs individual screens and is unavailable in local parties.',
        );
      if (!['battle-race', 'battle-arena'].includes(msg.gameType))
        return fail(ws, 'Unknown game type.');
      room.gameType = msg.gameType;
      room.trackId = msg.gameType === 'battle-arena' ? 'cafe' : 'coast';
      resetRoom(room, { newTournament: true });
      publish(room);
      return;
    }
    if (msg.type === 'track' && room.phase === 'lobby') {
      if (room.mode === 'lan' && msg.trackId === 'cafe')
        return fail(
          ws,
          'Battle Arena needs individual screens and is unavailable in local parties.',
        );
      if (!Object.hasOwn(TRACKS, msg.trackId)) return fail(ws, 'Unknown track.');
      if (room.trackId === msg.trackId) return;
      const changedMode = (room.trackId === 'cafe') !== (msg.trackId === 'cafe');
      room.trackId = msg.trackId;
      resetRoom(room, { newTournament: changedMode });
      publish(room);
      return;
    }
    if (msg.type === 'bot-difficulty') {
      if (room.phase !== 'lobby') return fail(ws, 'Return to the lobby to change bot difficulty.');
      if (!BOT_DIFFICULTY_MODES.includes(msg.difficulty))
        return fail(ws, 'Unknown bot difficulty.');
      if (room.botDifficulty === msg.difficulty) return;
      room.botDifficulty = msg.difficulty;
      for (const bot of room.players.values())
        if (bot.bot) {
          bot.botDifficulty = assignBotDifficulty(room.botDifficulty);
          bot.botState = null;
        }
      publish(room);
      return;
    }
    if (msg.type === 'bot') {
      const requestId = typeof msg.requestId === 'string' ? msg.requestId.slice(0, 80) : undefined;
      if (room.phase !== 'lobby') return fail(ws, 'Return to the lobby to add bots.', requestId);
      if (requestId && [...room.players.values()].some((p) => p.botRequestId === requestId)) {
        publish(room);
        return;
      }
      if (room.players.size >= MAX_PLAYERS) return fail(ws, 'The grid is full.', requestId);
      const bot = addPlayer(
        room,
        null,
        ['Nova', 'Rocco', 'Mika', 'Scout', 'Jett', 'Cleo', 'Ash'][room.players.size - 1] || 'Bot',
        true,
      );
      bot.botRequestId = requestId;
      publish(room);
      return;
    }
    if (msg.type === 'remove-bot' && room.phase === 'lobby') {
      const bot = room.players.get(msg.playerId);
      if (!bot?.bot) return fail(ws, 'Choose a bot to remove.');
      room.players.delete(bot.id);
      publish(room);
      return;
    }
    if (msg.type === 'start' && room.phase === 'lobby') {
      startRound(room, now);
    }
    if (msg.type === 'rematch' && room.phase === 'finished' && room.tournamentComplete) {
      startRound(room, now);
    }
  }
  function step(room, now) {
    selectTrack(room.trackId);
    if (nextRoundDue(room, now)) startRound(room, now, true);
    if (room.phase === 'countdown' && now >= room.startAt) {
      room.phase = 'racing';
      for (const p of room.players.values())
        applyLaunch(
          p.car,
          !p.bot && p.input.throttle > 0.1 && !p.input.reverse && now - p.lastInput <= 250
            ? p.accelPressedAt
            : null,
          room.startAt,
        );
    }
    if (room.phase === 'racing') {
      const motionBefore = new Map(
        [...room.players.values()].map((p) => [p.id, captureMotion(p.car)]),
      );
      room.simulationTick = (room.simulationTick || 0) + 1;
      room.raceTime = room.simulationTick * STEP;
      updateFactoryMechanics(
        [...room.players.values()].map((p) => p.car),
        room.raceTime,
      );
      for (const p of room.players.values()) {
        const input = p.bot
          ? botControls(room, p, now)
          : now - p.lastInput > INPUT_TIMEOUT_MS
            ? NEUTRAL
            : p.input;
        if (!p.bot && now - p.lastInput > INPUT_TIMEOUT_MS)
          stats.staleInputs = (stats.staleInputs || 0) + 1;
        p.simInput = input;
        p.appliedSeq = p.seq;
        const previousPose = { x: p.car.x, y: p.car.y, z: p.car.z };
        stepCar(p.car, input);
        p.car.raceTime = room.raceTime;
        collideDesertMoles(p.car, room.raceTime);
        collideCoastalCrabs(p.car, room.raceTime);
        if (
          room.gameType !== 'battle-arena' &&
          !p.car.finished &&
          !p.car.eliminated &&
          p.car.progress >= room.finishProgress
        ) {
          p.car.finished = true;
          p.car.finishTime = now - room.startAt;
        }
        collectPickup(p.car, room.pickups, now);
        collectBoostPad(p.car, room.boostPads, room.raceTime, previousPose);
      }
      const byCar = new Map([...room.players.values()].map((p) => [p.car, p]));
      const onElimination =
        room.gameType === 'battle-arena'
          ? (victim, attacker) =>
              awardArenaKill(room, byCar.get(victim), byCar.get(attacker)?.id, now)
          : undefined;
      resolveNudges([...byCar.keys()], { onElimination });
      collideCars([...byCar.keys()], { road: true, onElimination });
      updateCombat(room, STEP, now);
      for (const p of room.players.values())
        if (p.car.wrecked && !p.car.explosionShown) {
          p.car.explosionShown = true;
          p.car.eliminatedAt = now - room.startAt;
          room.sounds.push({
            id: ++room.serial,
            kind: 'explosion',
            owner: p.id,
            x: p.car.x,
            y: p.car.y || 0,
            z: p.car.z,
            at: now,
          });
          room.effects.push({
            id: ++room.serial,
            kind: 'explosion',
            x: p.car.x,
            z: p.car.z,
            until: now + 1100,
            color: '#ff993d',
          });
        }
      const players = [...room.players.values()];
      for (const p of room.gameType === 'battle-arena'
        ? []
        : updateChase(room.chase, players, now - room.startAt)) {
        room.effects.push({
          id: randomUUID(),
          kind: 'hit',
          x: p.car.x,
          z: p.car.z,
          until: now + 600,
          color: p.color,
        });
        room.sounds.push({
          id: ++room.serial,
          kind: 'elimination',
          owner: p.id,
          x: p.car.x,
          y: p.car.y || 0,
          z: p.car.z,
          at: now,
        });
      }
      updateSkyBeams(room, now);
      for (const p of players) recordMotion(p.car, motionBefore.get(p.id), STEP);
      const survivors = players.filter((p) => !p.car.eliminated),
        finished = survivors.filter((p) => p.car.finished);
      const lastStanding = room.raceSize > 1 && survivors.length <= 1;
      if (lastStanding && !room.survivorEndAt) room.survivorEndAt = now + 1800;
      if (lastStanding && survivors[0] && now >= room.survivorEndAt) {
        survivors[0].car.finished = true;
        survivors[0].car.finishTime = now - room.startAt;
        room.winnerId = survivors[0].id;
      }
      if (finished.length && !room.endedAt) room.endedAt = now + 25000;
      if (
        (lastStanding && now >= room.survivorEndAt) ||
        (!lastStanding && finished.length === survivors.length) ||
        (room.endedAt && now >= room.endedAt) ||
        now - room.startAt > 1200000
      ) {
        room.phase = 'finished';
        room.finishedAt = now;
        scoreRound(room, now);
        publish(room);
      }
    }
  }
  return { snapshot, publish, resetRoom, startRound, addPlayer, removePlayer, command, step };
}
