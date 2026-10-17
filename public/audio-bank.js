// All samples are local CC0 assets. Provenance and processing live in sounds/sources.json.
export const SOUND_FILES = [
  'engine-idle',
  'engine-low',
  'engine-mid',
  'engine-high',
  'coast',
  'wind',
  'skid',
  'gunshot',
  'shotgun',
  'flame',
  'taser',
  'thump',
  'rail-body',
  'elimination',
  'round-end',
  ...['plasma', 'rail', 'explosion', 'shield', 'metal', 'clank'].flatMap((kind) =>
    [0, 1, 2].map((i) => `${kind}-${i}`),
  ),
];
export class AudioBank {
  constructor(context, { fetcher = globalThis.fetch.bind(globalThis) } = {}) {
    this.context = context;
    this.fetcher = fetcher;
    this.buffers = new Map();
    this.errors = new Map();
    this.loading = null;
  }
  get(name) {
    return this.buffers.get(name);
  }
  // Four requests at a time; decode once and share buffers across all cars/voices.
  load() {
    if (this.loading) return this.loading;
    const pending = SOUND_FILES.filter((name) => !this.buffers.has(name));
    this.loading = (async () => {
      await Promise.all(
        Array.from({ length: Math.min(4, pending.length) }, async () => {
          while (pending.length) {
            const name = pending.shift();
            for (let attempt = 0; attempt < 2; attempt++) {
              const controller = new AbortController(),
                timer = setTimeout(() => controller.abort(), 30000);
              let stage = 'download',
                retryable = true;
              try {
                const response = await this.fetcher(`/sounds/${name}.wav`, {
                  signal: controller.signal,
                });
                if (!response.ok) {
                  retryable =
                    response.status >= 500 || response.status === 408 || response.status === 429;
                  throw new Error(`HTTP ${response.status}`);
                }
                const bytes = await response.arrayBuffer();
                clearTimeout(timer);
                stage = 'decode';
                retryable = false;
                const buffer = await this.context.decodeAudioData(bytes);
                this.buffers.set(name, buffer);
                this.errors.delete(name);
                break;
              } catch (error) {
                this.errors.set(
                  name,
                  `${stage}: ${error.name || 'Error'}: ${error.message || error}`,
                );
                if (!retryable) break;
              } finally {
                clearTimeout(timer);
              }
            }
          }
        }),
      );
      return {
        loaded: this.buffers.size,
        failed: [...this.errors.keys()],
        errors: Object.fromEntries(this.errors),
      };
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
}
export function sampleLoop(context, buffer, destination, { offset = 0, rate = 1 } = {}) {
  const source = context.createBufferSource(),
    gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = rate;
  gain.gain.value = 0;
  source.connect(gain);
  gain.connect(destination);
  source.start(context.currentTime, offset % buffer.duration);
  let stopped = false;
  return {
    source,
    gain,
    stop() {
      if (stopped) return;
      stopped = true;
      const at = context.currentTime;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setTargetAtTime(0, at, 0.012);
      source.stop(at + 0.08);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    },
  };
}
