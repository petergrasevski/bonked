import { AudioBank } from './audio-bank.js';
import { AudioMixer } from './audio-mixer.js';
import { EngineAudio } from './engine-audio.js';
import { WeaponAudio, WEAPON_SOUNDS } from './weapon-audio.js';
import { MusicAudio } from './music-audio.js';
import { RoadAudio } from './road-audio.js';
export async function checkAudio() {
  const sampleRate = 48000,
    context = new OfflineAudioContext(2, sampleRate * 9, sampleRate),
    bank = new AudioBank(context);
  const loaded = await bank.load();
  if (loaded.failed.length) throw new Error('Failed samples: ' + JSON.stringify(loaded.errors));
  const mixer = new AudioMixer(context),
    options = { bank, mixer },
    engines = new EngineAudio(context, options),
    weapons = new WeaponAudio(context, options),
    road = new RoadAudio(context, options);
  const format = document.createElement('audio').canPlayType('audio/ogg; codecs="vorbis"')
    ? 'ogg'
    : 'mp3';
  const music = new MusicAudio(context, { mixer, format });
  if (!(await music.load())) throw music.error;
  music.offset = music.buffer.duration - 0.8;
  const listener = { x: 0, y: 0, z: 0, angle: 0 },
    players = Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      x: (i - 4) * 4,
      y: 0,
      z: (i % 2) * 4,
      groundY: 0,
      angle: 0,
      vx: 0,
      vz: 0,
      input: { throttle: 1 },
    }));
  const state = {
    code: 'QA',
    round: 1,
    phase: 'racing',
    trackId: 'coast',
    time: 0,
    raceTime: 0,
    players,
    sounds: [],
  };
  let maxVoices = 0,
    spectatorEngines = 0;
  function update(t) {
    state.time = t * 1000;
    state.raceTime = t;
    players.forEach((car, i) => {
      car.vx = Math.min(42, t * 10 + i);
      car.vz = t > 2 && t < 4 ? 8 : 0;
      car.firing = i === 2 && t > 1 && t < 4 ? 'flame' : i === 3 && t > 1 && t < 4 ? 'taser' : null;
    });
    state.trackId = t < 3 ? 'coast' : t < 5 ? 'ice' : 'desert';
    if (t >= 6) players[0].eliminated = true;
    if (t >= 6.3) {
      state.phase = 'finished';
      state.sounds = [{ id: 'death-line', kind: 'elimination', owner: '0', x: 0, z: 0, at: 6300 }];
    }
    if (t >= 7) {
      engines.stop();
      weapons.stop();
      road.stop();
      music.stop();
      mixer.stop();
      return;
    }
    mixer.setMuted(t >= 5.7 && t < 5.9);
    music.update(!(t >= 5.7 && t < 5.9));
    engines.update(state, listener, true, '0');
    road.update(state, listener, true, '0');
    weapons.update(state, listener, true, '0');
    const kinds = Object.keys(WEAPON_SOUNDS).filter((k) => !WEAPON_SOUNDS[k].loop),
      index = Math.round(t * 10);
    if (index % 4 === 0)
      weapons.voice(kinds[(index / 4) % kinds.length], { volume: 1, pan: 0 }, { local: true });
    if (index === 40)
      for (let i = 0; i < 60; i++)
        weapons.voice(
          i % 8 === 0 ? 'explosion' : 'machinegun',
          { volume: i % 8 === 0 ? 1 : 0.15, pan: 0 },
          { local: i % 8 === 0 },
        );
    maxVoices = Math.max(maxVoices, weapons.voices.size);
    if (t >= 6 && t < 6.3) spectatorEngines = engines.engines.size;
    mixer.update(true, t > 4.5 && t < 5.5 ? 0.1 : 0);
  }
  update(0);
  const pending = [];
  for (let step = 1; step <= 70; step++) {
    const t = step / 10;
    pending.push(
      context.suspend(t).then(() => {
        update(t);
        return context.resume();
      }),
    );
  }
  const buffer = await context.startRendering();
  await Promise.all(pending);
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];
  let peak = 0,
    sum = 0,
    tailPeak = 0,
    nonfinite = 0;
  for (const data of channels)
    for (let i = 0; i < data.length; i++) {
      const value = data[i];
      if (!Number.isFinite(value)) nonfinite++;
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
      if (i > sampleRate * 7.5) tailPeak = Math.max(tailPeak, Math.abs(value));
    }
  const report = {
    ...loaded,
    peak,
    rms: Math.sqrt(sum / (buffer.length * 2)),
    tailPeak,
    nonfinite,
    maxVoices,
    spectatorEngines,
    musicDuration: music.buffer.duration,
    remainingMusic: music.loop ? 1 : 0,
    remainingVoices: weapons.voices.size,
    remainingEngines: engines.engines.size,
    remainingSkids: road.skids.size,
  };
  if (
    nonfinite ||
    peak >= 0.99 ||
    peak < 0.01 ||
    tailPeak > 1e-5 ||
    maxVoices > 40 ||
    spectatorEngines !== 7 ||
    music.loop ||
    weapons.voices.size ||
    engines.engines.size ||
    road.skids.size
  )
    throw new Error(JSON.stringify(report));
  return report;
}
