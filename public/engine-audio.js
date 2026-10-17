import { soundPosition } from './weapon-audio.js';
import { sampleLoop } from './audio-bank.js';
import { engineAudible } from './audio.js';

// Listen at the camera's ground target, so the race stays audible after death.
export function raceListener(state, view) {
  for (const p of [view, state?.camera])
    if (Number.isFinite(p?.x) && Number.isFinite(p?.z))
      return { x: p.x, y: p.y || 0, z: p.z, angle: p.angle || 0 };
  const cars = state?.players?.filter((c) => !c.eliminated && !c.falling) || [];
  if (!cars.length) return null;
  return {
    x: cars.reduce((n, c) => n + c.x, 0) / cars.length,
    z: cars.reduce((n, c) => n + c.z, 0) / cars.length,
    angle: cars[0].angle || 0,
  };
}
const shifts = [10, 17, 24, 31],
  ratios = [525, 305, 218, 165, 140];
export function engineParameters(car, previousGear = 0) {
  const speed = Math.hypot(car.vx || 0, car.vz || 0),
    forward = (car.vx || 0) * Math.cos(car.angle || 0) + (car.vz || 0) * Math.sin(car.angle || 0);
  let gear = previousGear;
  while (gear < 4 && speed > shifts[gear]) gear++;
  while (gear > 0 && speed < shifts[gear - 1] - 2) gear--;
  if (forward < -0.5) gear = 0;
  const throttle = Math.max(0, Math.min(1, car.input?.reverse ? 1 : car.input?.throttle || 0));
  const rpm = Math.min(6700, 850 + speed * (forward < -0.5 ? 340 : ratios[gear]) + throttle * 220);
  return { gear, rpm, load: throttle, speed, shifted: gear !== previousGear };
}
// These are artistic RPM anchors for the four recordings, not measured BMW telemetry.
export const ENGINE_BANDS = [
  ['engine-idle', 850],
  ['engine-low', 2200],
  ['engine-mid', 4200],
  ['engine-high', 6500],
];
export function engineBlend(rpm, bands = ENGINE_BANDS) {
  const weights = bands.map(() => 0);
  if (!bands.length) return weights;
  if (rpm <= bands[0][1]) {
    weights[0] = 1;
    return weights;
  }
  if (rpm >= bands.at(-1)[1]) {
    weights[weights.length - 1] = 1;
    return weights;
  }
  for (let i = 0; i < bands.length - 1; i++)
    if (rpm >= bands[i][1] && rpm < bands[i + 1][1]) {
      const blend = (rpm - bands[i][1]) / (bands[i + 1][1] - bands[i][1]);
      weights[i] = Math.cos((blend * Math.PI) / 2);
      weights[i + 1] = Math.sin((blend * Math.PI) / 2);
      break;
    }
  return weights;
}
export class EngineAudio {
  constructor(context, { bank, mixer } = {}) {
    this.context = context;
    this.bank = bank;
    this.mixer = mixer;
    this.engines = new Map();
    this.room = null;
  }
  create(id, local, bands) {
    const c = this.context,
      filter = c.createBiquadFilter(),
      level = c.createGain(),
      pan = c.createStereoPanner();
    filter.type = 'lowpass';
    filter.Q.value = 0.65;
    level.gain.value = 0;
    filter.connect(level);
    level.connect(pan);
    pan.connect(this.mixer?.bus(local ? 'playerEngine' : 'rivalEngines') || c.destination);
    const seed = [...String(id)].reduce((n, ch) => n + ch.charCodeAt(0), 0),
      timbre = 1 + ((seed % 9) - 4) * 0.005;
    const layers = bands.map(([name]) =>
      sampleLoop(c, this.bank.get(name), filter, {
        offset: ((seed % 97) / 97) * this.bank.get(name).duration,
      }),
    );
    const e = { gear: 0, shiftUntil: 0, timbre, filter, level, pan, layers, bands, local };
    e.stop = () => {
      for (const l of layers) l.stop();
      level.gain.setTargetAtTime(0, c.currentTime, 0.01);
      // Keep the graph connected for the short release, then free the downstream nodes.
      layers[0].source.addEventListener(
        'ended',
        () => {
          filter.disconnect();
          level.disconnect();
          pan.disconnect();
        },
        { once: true },
      );
    };
    return e;
  }
  update(state, listener, enabled, playerId = null) {
    const c = this.context,
      key = state ? `${state.code}:${state.round}` : null;
    if (this.room !== key) {
      this.stop();
      this.room = key;
    }
    const active = enabled && ['countdown', 'racing'].includes(state?.phase),
      wanted = new Set();
    const bands = ENGINE_BANDS.filter(([name]) => this.bank?.get(name));
    if (active && bands.length)
      for (const car of state.players || []) {
        if (!engineAudible('racing', car, true, true, true)) continue;
        const local = car.id === playerId,
          spatial = soundPosition(car, listener);
        if (!local && spatial.volume < 0.003) continue;
        wanted.add(car.id);
        let e = this.engines.get(car.id);
        if (e && (e.local !== local || e.bands.length !== bands.length)) {
          e.stop();
          this.engines.delete(car.id);
          e = null;
        }
        if (!e) {
          e = this.create(car.id, local, bands);
          e.gear = engineParameters(car).gear;
          this.engines.set(car.id, e);
        }
        const p = engineParameters(car, e.gear);
        if (p.shifted) e.shiftUntil = c.currentTime + 0.12;
        e.gear = p.gear;
        const shift = c.currentTime < e.shiftUntil,
          load = shift ? 0.15 : p.load,
          weights = engineBlend(p.rpm, bands);
        for (let i = 0; i < e.layers.length; i++) {
          e.layers[i].source.playbackRate.setTargetAtTime(
            Math.max(0.72, Math.min(1.35, p.rpm / bands[i][1])) * e.timbre,
            c.currentTime,
            0.09,
          );
          e.layers[i].gain.gain.setTargetAtTime(weights[i], c.currentTime, 0.07);
        }
        // Throttle opens the intake/exhaust colour; coasting keeps its quieter mechanical texture.
        e.filter.frequency.setTargetAtTime(
          (1100 + p.rpm * 0.7 + load * 2400) * (local ? 1 : 0.45 + 0.55 * spatial.volume),
          c.currentTime,
          0.08,
        );
        const focus = local ? 0.85 + 0.15 * spatial.volume : spatial.volume;
        e.level.gain.setTargetAtTime(
          focus * (0.23 + load * 0.18 + Math.min(p.speed / 36, 1) * 0.04) * (shift ? 0.63 : 1),
          c.currentTime,
          0.055,
        );
        e.pan.pan.setTargetAtTime(spatial.pan * (local ? 0.3 : 1), c.currentTime, 0.07);
      }
    for (const [id, e] of this.engines)
      if (!wanted.has(id)) {
        e.stop();
        this.engines.delete(id);
      }
  }
  stop() {
    for (const e of this.engines.values()) e.stop();
    this.engines.clear();
  }
}
