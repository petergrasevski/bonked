import { angleDelta } from './game.js';
const fields = ['x', 'y', 'z', 'angle', 'pitch', 'roll', 'progress'];
const rates = [
  'renderVx',
  'renderRise',
  'renderVz',
  'renderTurn',
  'renderPitch',
  'renderRoll',
  'renderProgress',
];
const angular = new Set(['angle', 'pitch', 'roll']);
// Render peers between authoritative samples instead of repeatedly guessing
// their next turn. Use server timestamps, never packet arrival spacing.
export class RemoteSnapshots {
  constructor() {
    this.reset();
  }
  reset() {
    this.frames = [];
    this.offset = null;
    this.cursor = null;
    this.sampleAt = null;
    this.lastArrival = null;
    this.jitter = 0;
    this.delay = 100;
    this.underruns = 0;
  }
  push(state, arrival) {
    const time = state.time;
    if (!Number.isFinite(time)) return;
    const last = this.frames.at(-1);
    if (last && time <= last.time) return;
    if (last && this.lastArrival !== null) {
      const jitter = Math.abs(arrival - this.lastArrival - (time - last.time));
      this.jitter += 0.1 * (Math.min(300, jitter) - this.jitter);
    }
    this.delay = Math.min(220, 100 + this.jitter * 2);
    const offset = arrival - time;
    // The fastest delivery estimates the clock difference plus baseline
    // one-way transit. Later, slower packets must not rewind the playhead.
    this.offset = this.offset === null ? offset : Math.min(this.offset + 0.02, offset);
    this.frames.push({ time, players: state.players });
    if (this.frames.length > 40) this.frames.shift();
    this.lastArrival = arrival;
  }
  sample(now) {
    if (!this.frames.length) return null;
    const latest = this.frames.at(-1),
      target = now - this.offset - this.delay;
    if (this.cursor === null) this.cursor = target;
    else {
      const elapsed = Math.max(0, Math.min(100, now - this.sampleAt));
      const error = target - (this.cursor + elapsed);
      this.cursor += elapsed * Math.max(0.9, Math.min(1.1, 1 + error / 500));
    }
    this.sampleAt = now;
    const time = Math.min(this.cursor, latest.time + 50);
    if (this.cursor > latest.time + 50) this.underruns++;
    let a = this.frames[0],
      b = a;
    for (const frame of this.frames) {
      if (frame.time <= time) a = frame;
      if (frame.time >= time) {
        b = frame;
        break;
      }
      b = frame;
    }
    const newer = new Map(b.players.map((p) => [p.id, p]));
    return a.players.map((car) => {
      const next = newer.get(car.id) || car,
        pose = { ...next };
      if (car.eliminated !== next.eliminated || Math.hypot(car.x - next.x, car.z - next.z) > 12)
        return { ...next };
      const alpha =
        b.time > a.time ? Math.max(0, Math.min(1, (time - a.time) / (b.time - a.time))) : 0;
      for (let i = 0; i < fields.length; i++) {
        const key = fields[i],
          start = car[key] || 0,
          delta = angular.has(key) ? angleDelta(next[key] || 0, start) : (next[key] || 0) - start;
        pose[key] = start + delta * alpha;
        if (a === b && time > a.time)
          pose[key] += ((car[rates[i]] || 0) * Math.min(50, time - a.time)) / 1000;
      }
      return pose;
    });
  }
}
