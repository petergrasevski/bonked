// Always-on, bounded flight recorder. No names, room codes, tokens or voice data.
const WINDOW_MS = 30000,
  MAX_EVENTS = 1200;
const number = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const pick = (value, keys) => Object.fromEntries(keys.map((k) => [k, number(value?.[k])]));
const poseKeys = ['x', 'y', 'z', 'angle', 'progress', 'renderVx', 'renderVz', 'renderProgress'];
export class LagRecorder {
  constructor({ now = () => performance.now(), wall = () => Date.now() } = {}) {
    this.now = now;
    this.wall = wall;
    this.events = [];
    this.lastFrame = -Infinity;
    this.frameMax = 0;
    this.frameCount = 0;
    this.discardedMs = 0;
  }
  add(kind, data) {
    const t = this.now();
    this.events.push({ t: number(t), kind, ...data });
    this.prune(t);
  }
  prune(t) {
    while (
      this.events.length &&
      (this.events[0].t < t - WINDOW_MS || this.events.length > MAX_EVENTS)
    )
      this.events.shift();
  }
  frame({
    frameMs,
    age,
    hidden,
    phase,
    track,
    round,
    overlay,
    players,
    camera,
    cameraTarget,
    cameraPosition,
    predicted,
    queuedBytes,
    skyTargets,
  }) {
    this.frameMax = Math.max(this.frameMax, frameMs);
    this.frameCount++;
    this.discardedMs += Math.max(0, frameMs - 50);
    const now = this.now();
    if (now - this.lastFrame < 100) return;
    this.add('frame', {
      frameMaxMs: number(this.frameMax),
      frames: this.frameCount,
      discardedMs: number(this.discardedMs),
      snapshotAgeMs: number(age),
      hidden: !!hidden,
      phase,
      track,
      round,
      overlay: !!overlay,
      queuedBytes: number(queuedBytes),
      cars: (players || []).slice(0, 8).map((p) => ({
        id: p.id,
        ...pick(p, poseKeys),
        eliminated: !!p.eliminated,
        skyTarget: p.skyTarget ? pick(p.skyTarget, ['x', 'z']) : null,
      })),
      predicted: (predicted || []).slice(0, 8).map((p) => ({ id: p.id, ...pick(p, poseKeys) })),
      camera: pick(camera, ['x', 'y', 'z', 'angle', 'pitch', 'distance']),
      cameraTarget: pick(cameraTarget, ['x', 'y', 'z', 'angle', 'pitch']),
      cameraPosition: pick(cameraPosition, ['x', 'y', 'z']),
      skyTargets: [...(skyTargets || [])].slice(0, 8).map(([id, mesh]) => ({
        id,
        x: number(mesh.material.uniforms.center.value.x),
        z: number(mesh.material.uniforms.center.value.y),
      })),
    });
    this.lastFrame = now;
    this.frameMax = 0;
    this.frameCount = 0;
    this.discardedMs = 0;
  }
  capture(context = {}) {
    const now = this.now();
    this.prune(now);
    return {
      schema: 'bonked-lag-v1',
      capturedAt: new Date(this.wall()).toISOString(),
      clientMonotonicMs: number(now),
      requestedWindowMs: WINDOW_MS,
      availableWindowMs: this.events.length ? number(now - this.events[0].t) : 0,
      ...context,
      events: this.events.map((e) => ({ ...e })),
    };
  }
}

// A saved local copy and a persistent download link survive offline/timeout paths.
export function createLagReportUI({ recorder, send, button, download, status, context, storage }) {
  let waiting = null,
    blobUrl = null;
  const storageKey = 'bonked-last-lag-report-v1';
  function save(report, autoDownload = false) {
    const json = JSON.stringify(report);
    let persisted = !!storage;
    try {
      storage?.setItem(storageKey, json);
    } catch {
      persisted = false;
    }
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    download.href = blobUrl;
    download.download = `bonked-lag-${report.id}.json`;
    download.hidden = false;
    status.textContent = `${report.serverCapture?.status === 'captured' ? 'Client and server captured.' : 'Client captured; server capture unavailable.'} ${persisted ? 'A copy is saved in this browser.' : 'Download to keep this report.'}`;
    if (autoDownload) download.click();
  }
  try {
    const previous = JSON.parse(storage?.getItem(storageKey) || 'null');
    if (previous?.schema === 'bonked-lag-v1' && typeof previous.id === 'string') save(previous);
  } catch {}
  function finish(serverCapture) {
    if (!waiting) return;
    const { report, timer } = waiting;
    clearTimeout(timer);
    waiting = null;
    report.serverCapture = serverCapture;
    save(report, true);
    button.disabled = false;
  }
  button.onclick = () => {
    if (waiting) return;
    button.disabled = true;
    const report = recorder.capture({
      ...context(),
      id: crypto.randomUUID(),
      serverCapture: { status: 'pending' },
    });
    save(report);
    status.textContent = 'Capturing server timing…';
    waiting = { report, timer: setTimeout(() => finish({ status: 'timeout' }), 2500) };
    if (!send({ type: 'lag-report', id: report.id })) finish({ status: 'offline' });
  };
  return {
    receive(message) {
      if (message.type === 'lag-report' && message.id === waiting?.report.id)
        finish(message.capture);
    },
  };
}
