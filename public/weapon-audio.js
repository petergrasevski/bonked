const variants = (prefix) => [0, 1, 2].map((i) => `${prefix}-${i}`);
// A transient, a body, and a short tail give each weapon its own silhouette.
export const WEAPON_SOUNDS = {
  pulse: {
    samples: ['thump'],
    layer: variants('shield'),
    gain: 0.9,
    layerGain: 0.38,
    rate: 0.72,
    duration: 0.8,
    priority: 70,
  },
  rocket: {
    samples: variants('explosion'),
    layer: ['flame'],
    gain: 0.45,
    layerGain: 0.5,
    rate: 1.4,
    duration: 0.38,
    priority: 60,
  },
  machinegun: {
    samples: ['gunshot'],
    layer: variants('clank'),
    gain: 0.29,
    layerGain: 0.14,
    rate: 1.4,
    duration: 0.16,
    priority: 35,
  },
  shield: { samples: variants('shield'), gain: 0.55, rate: 0.95, duration: 0.85, priority: 45 },
  railgun: {
    samples: variants('rail'),
    layer: ['rail-body'],
    gain: 1,
    layerGain: 0.95,
    rate: 0.64,
    layerRate: 1,
    duration: 1.25,
    priority: 90,
  },
  mine: {
    samples: variants('clank'),
    layer: variants('shield'),
    gain: 0.5,
    layerGain: 0.12,
    rate: 1.1,
    duration: 0.22,
    priority: 30,
  },
  chain: {
    samples: variants('metal'),
    layer: variants('clank'),
    gain: 0.65,
    layerGain: 0.4,
    rate: 0.65,
    duration: 0.45,
    priority: 40,
  },
  plasma: {
    samples: variants('plasma'),
    layer: ['thump'],
    gain: 0.32,
    layerGain: 0.06,
    rate: 0.95,
    duration: 0.24,
    priority: 40,
  },
  shotgun: {
    samples: ['shotgun'],
    layer: variants('clank'),
    gain: 0.85,
    layerGain: 0.35,
    rate: 0.88,
    duration: 0.72,
    priority: 65,
  },
  flame: { samples: ['flame'], gain: 0.42, rate: 0.9, loop: true, priority: 40 },
  taser: { samples: ['taser'], gain: 0.32, rate: 1, loop: true, priority: 40 },
  elimination: {
    samples: ['elimination'],
    layer: ['rail-body'],
    gain: 1,
    layerGain: 0.4,
    layerRate: 1.3,
    rate: 1,
    duration: 1.25,
    priority: 95,
    bus: 'ui',
  },
  'round-end': {
    samples: ['round-end'],
    gain: 0.6,
    rate: 1,
    duration: 1.8,
    priority: 100,
    bus: 'ui',
  },
  impact: { samples: variants('metal'), gain: 0.45, rate: 1.3, duration: 0.25, priority: 30 },
  explosion: {
    samples: variants('explosion'),
    layer: ['thump'],
    gain: 0.95,
    layerGain: 0.55,
    rate: 0.85,
    duration: 1.2,
    priority: 80,
  },
};
export function soundPosition(source, listener) {
  if (!listener) return { volume: 0, pan: 0 };
  const dx = source.x - listener.x,
    dz = source.z - listener.z,
    dy = (source.y || 0) - (listener.y || 0),
    d = Math.hypot(dx, dy, dz);
  return {
    volume: Math.max(0, 1 - d / 100) ** 2,
    pan: Math.max(
      -0.85,
      Math.min(
        0.85,
        (-dx * Math.sin(listener.angle || 0) + dz * Math.cos(listener.angle || 0)) / 30,
      ),
    ),
  };
}
export function weaponFocus(event, player) {
  // Death-line losses are global round cues, including while spectating.
  if (event.kind === 'elimination') return true;
  if (!player || player.eliminated || player.wrecked || player.falling || player.finished)
    return false;
  const impact = event.kind === 'explosion' || event.kind === 'impact';
  // A nearby threat matters even when the shared camera has moved away. Ownership
  // alone must not make a distant rocket detonation sound point-blank.
  return impact
    ? Math.hypot(event.x - player.x, (event.y || 0) - (player.y || 0), event.z - player.z) < 18
    : event.owner === player.id;
}
export class WeaponAudio {
  constructor(context, { bank, mixer, random = Math.random } = {}) {
    this.context = context;
    this.bank = bank;
    this.mixer = mixer;
    this.random = random;
    this.seen = new Set();
    this.loops = new Map();
    this.voices = new Set();
    this.lastVariant = new Map();
    this.room = null;
    this.phase = null;
  }
  choose(names) {
    const available = names.filter((name) => this.bank?.get(name));
    if (!available.length) return null;
    const key = names.join(','),
      previous = this.lastVariant.get(key),
      choices = available.length > 1 ? available.filter((name) => name !== previous) : available;
    const name = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
    this.lastVariant.set(key, name);
    return name;
  }
  voice(kind, position, { local = false, priority = 0 } = {}) {
    const spec = WEAPON_SOUNDS[kind];
    if (!spec) return null;
    const name = this.choose(spec.samples);
    if (!name) return null;
    const importance = spec.priority + priority + (local ? 65 : 0) + position.volume * 20;
    // Reserve room for a short release on stolen voices. Distant small shots yield first.
    const active = [...this.voices].filter((v) => !v.stopped);
    if (this.voices.size >= 40) return null;
    if (active.length >= 32) {
      const victim = active.filter((v) => !v.loop).sort((a, b) => a.priority - b.priority)[0];
      if (!victim || victim.priority >= importance) return null;
      victim.stop();
    }
    const c = this.context,
      t = c.currentTime,
      filter = c.createBiquadFilter(),
      level = c.createGain(),
      pan = c.createStereoPanner();
    filter.type = 'lowpass';
    filter.frequency.value = local ? 14000 : 1600 + position.volume * 11000;
    filter.Q.value = 0.6;
    filter.connect(level);
    level.connect(pan);
    pan.connect(this.mixer?.bus(spec.bus || 'weapons') || c.destination);
    level.gain.value = local ? Math.max(0.8, position.volume) : position.volume;
    pan.pan.value = position.pan;
    const sources = [],
      gains = [],
      rate = spec.rate * (0.975 + this.random() * 0.05),
      voice = {
        kind,
        loop: !!spec.loop,
        priority: importance,
        level,
        pan,
        filter,
        sources,
        stopped: false,
      };
    const add = (sample, volume, playbackRate = rate) => {
      const buffer = this.bank.get(sample),
        source = c.createBufferSource(),
        gain = c.createGain();
      source.buffer = buffer;
      source.loop = !!spec.loop;
      source.playbackRate.value = playbackRate;
      source.connect(gain);
      gain.connect(filter);
      sources.push(source);
      gains.push(gain);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * (0.95 + this.random() * 0.05), t + 0.003);
      source.start(t, spec.loop ? this.random() * buffer.duration : 0);
      if (!spec.loop) {
        const duration = Math.min(spec.duration, buffer.duration / playbackRate);
        gain.gain.setTargetAtTime(0, t + duration * 0.55, Math.max(0.015, duration * 0.14));
        source.stop(t + duration + 0.025);
      }
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        voice.ended = (voice.ended || 0) + 1;
        if (voice.ended === sources.length) {
          for (const n of [filter, level, pan]) n.disconnect();
          this.voices.delete(voice);
        }
      };
    };
    voice.stop = () => {
      if (voice.stopped) return;
      voice.stopped = true;
      const at = c.currentTime;
      for (const g of gains) {
        g.gain.cancelScheduledValues(at);
        g.gain.setTargetAtTime(0, at, 0.009);
      }
      for (const s of sources) s.stop(at + 0.05);
    };
    add(name, spec.gain);
    const layer = spec.layer && this.choose(spec.layer);
    if (layer) add(layer, spec.layerGain, spec.layerRate || rate);
    this.voices.add(voice);
    if (
      !spec.loop &&
      (local || position.volume > 0.3) &&
      ['explosion', 'railgun', 'shotgun', 'pulse', 'rocket', 'elimination'].includes(kind)
    )
      this.mixer?.accent(['explosion', 'railgun', 'elimination'].includes(kind) ? 1 : 0.6);
    return voice;
  }
  update(state, listener, enabled, playerId = null) {
    const c = this.context,
      key = state ? `${state.code}:${state.round}` : null;
    if (key !== this.room) {
      this.stop();
      this.seen.clear();
      this.room = key;
      this.phase = null;
    }
    const active = enabled && state?.phase === 'racing',
      player = state?.players?.find((car) => car.id === playerId);
    const ending = enabled && state?.phase === 'finished';
    if (ending && this.phase === 'racing')
      this.voice('round-end', { volume: 1, pan: 0 }, { local: true });
    this.phase = state?.phase;
    // Consume events even while muted/loading, so unlocking audio never replays old shots.
    for (const event of state?.sounds || []) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if ((active || ending) && (state.combatTime ?? state.time) - event.at < 500) {
        const p =
            event.kind === 'elimination' ? { volume: 1, pan: 0 } : soundPosition(event, listener),
          local = weaponFocus(event, player);
        if (local || p.volume > 0.002) this.voice(event.kind, p, { local });
      }
    }
    if (this.seen.size > 512) this.seen = new Set([...this.seen].slice(-256));
    const wanted = new Set();
    if (active)
      for (const car of state.players || []) {
        if (!WEAPON_SOUNDS[car.firing]?.loop || car.eliminated || car.wrecked || car.finished)
          continue;
        const p = soundPosition(car, listener),
          local = car.id === playerId;
        if (!local && p.volume < 0.002) continue;
        wanted.add(car.id);
        let v = this.loops.get(car.id);
        if (v?.kind !== car.firing || v.stopped) {
          v?.stop();
          v = this.voice(car.firing, p, { local });
          if (v) this.loops.set(car.id, v);
          else this.loops.delete(car.id);
        }
        if (v) {
          v.level.gain.setTargetAtTime(
            local ? Math.max(0.8, p.volume) : p.volume,
            c.currentTime,
            0.04,
          );
          v.pan.pan.setTargetAtTime(p.pan, c.currentTime, 0.04);
          v.filter.frequency.setTargetAtTime(
            local ? 14000 : 1600 + p.volume * 11000,
            c.currentTime,
            0.08,
          );
        }
      }
    for (const [id, v] of this.loops)
      if (!wanted.has(id)) {
        v.stop();
        this.loops.delete(id);
      }
    // Let final impacts and the results chime decay across the phase transition.
    if (!active && !ending) for (const v of this.voices) v.stop();
  }
  stop() {
    for (const v of this.voices) v.stop();
    this.loops.clear();
  }
}
