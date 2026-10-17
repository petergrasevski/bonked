const clamp = (v) => Math.max(0, Math.min(1, v));
export const BUS_LEVELS = {
  playerEngine: 0.9,
  rivalEngines: 0.48,
  weapons: 0.85,
  tyres: 0.65,
  ambience: 0.28,
  ui: 0.6,
};
export function mixTargets({ impact = 0, speech = 0 } = {}) {
  impact = clamp(impact);
  speech = clamp(speech);
  return {
    playerEngine: BUS_LEVELS.playerEngine * (1 - 0.3 * impact) * (1 - 0.5 * speech),
    rivalEngines: BUS_LEVELS.rivalEngines * (1 - 0.65 * impact) * (1 - 0.7 * speech),
    weapons: BUS_LEVELS.weapons * (1 - 0.45 * speech),
    tyres: BUS_LEVELS.tyres * (1 - 0.2 * impact) * (1 - 0.45 * speech),
    ambience: BUS_LEVELS.ambience * (1 - 0.7 * impact) * (1 - 0.7 * speech),
    ui: BUS_LEVELS.ui,
  };
}
export class AudioMixer {
  constructor(context, { effects = 1, music = 1, muted = false } = {}) {
    this.context = context;
    this.muted = muted;
    this.setVolumes({ effects, music });
    this.buses = {};
    this.impactUntil = 0;
    this.impactStrength = 0;
    this.speechUntil = 0;
    this.compressor = context.createDynamicsCompressor();
    Object.assign(this.compressor.threshold, { value: -8 });
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.16;
    // Final bounded soft clip catches coincident transients the compressor's attack lets through.
    this.ceiling = context.createWaveShaper();
    const curve = new Float32Array(4097);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1,
        a = Math.abs(x);
      curve[i] = Math.sign(x) * (a <= 0.86 ? a : 0.86 + 0.12 * Math.tanh((a - 0.86) / 0.12));
    }
    this.ceiling.curve = curve;
    this.ceiling.oversample = '2x';
    // Music has its own output; party chat uses a separate AudioContext.
    this.music = context.createGain();
    this.music.gain.value = 0;
    this.music.connect(context.destination);
    this.buses.music = this.music;
    this.master = context.createGain();
    this.master.gain.value = 0;
    for (const [name, level] of Object.entries(BUS_LEVELS)) {
      const bus = context.createGain();
      bus.gain.value = level;
      bus.connect(this.compressor);
      this.buses[name] = bus;
    }
    this.compressor.connect(this.ceiling);
    this.ceiling.connect(this.master);
    this.master.connect(context.destination);
  }
  setVolumes({ effects = this.effectsVolume, music = this.musicVolume }) {
    this.effectsVolume = clamp(Number.isFinite(effects) ? effects : 1);
    this.musicVolume = clamp(Number.isFinite(music) ? music : 1);
  }
  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) this.stop();
  }
  bus(name) {
    return this.buses[name];
  }
  accent(strength = 1) {
    const now = this.context.currentTime;
    this.impactStrength = Math.max(
      now < this.impactUntil ? this.impactStrength : 0,
      clamp(strength),
    );
    this.impactUntil = now + 0.22;
  }
  update(enabled, speechLevel = 0, { musicEnabled = enabled } = {}) {
    enabled = enabled && !this.muted;
    musicEnabled = musicEnabled && !this.muted;
    const t = this.context.currentTime;
    if (speechLevel > 0.015) this.speechUntil = t + 0.25;
    const impact = t < this.impactUntil ? this.impactStrength : 0,
      speech = t < this.speechUntil ? 1 : 0;
    const targets = mixTargets({ impact, speech });
    for (const [name, value] of Object.entries(targets)) {
      const p = this.buses[name].gain;
      p.setTargetAtTime(value, t, value < p.value ? 0.018 : 0.28);
    }
    this.music.gain.setTargetAtTime(
      musicEnabled ? 0.8 * this.musicVolume * (1 - 0.3 * impact) * (speech ? 0.55 : 1) : 0,
      t,
      musicEnabled ? 0.1 : 0.012,
    );
    this.master.gain.setTargetAtTime(
      enabled ? 0.8 * this.effectsVolume : 0,
      t,
      enabled ? 0.04 : 0.012,
    );
  }
  stop() {
    const t = this.context.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, 0.008);
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(0, t, 0.008);
    this.impactUntil = this.speechUntil = 0;
  }
}
