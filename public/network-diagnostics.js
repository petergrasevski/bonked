import { Samples, NETWORK_VERSION } from '/shared/network-timing.js';
export class NetworkDiagnostics {
  constructor(send) {
    this.send = send;
    this.metrics = Object.fromEntries(
      ['rttMs', 'snapshotGapMs', 'frameMs', 'correctionM', 'replaySteps', 'bufferedBytes'].map(
        (k) => [k, new Samples()],
      ),
    );
    this.started = performance.now();
    this.lastSnapshot = null;
    this.stalls = 0;
    this.inStall = false;
    this.latest = [];
    this.server = null;
    this.ping = null;
    this.lastPong = 0;
    this.fps = null;
    this.frameElapsed = 0;
    this.frameCount = 0;
    this.devLogs = false;
  }
  add(key, value) {
    this.metrics[key]?.add(value);
  }
  pong(ms, server) {
    this.ping = ms;
    this.lastPong = performance.now();
    this.add('rttMs', ms);
    this.server = server || this.server;
  }
  snapshot(now) {
    if (this.lastSnapshot !== null) this.add('snapshotGapMs', now - this.lastSnapshot);
    this.lastSnapshot = now;
  }
  resetStream() {
    this.lastSnapshot = null;
    this.inStall = false;
  }
  frame(ms, age, active) {
    this.add('frameMs', ms);
    if (document.hidden || ms > 1000) {
      this.frameElapsed = 0;
      this.frameCount = 0;
      this.fps = null;
    } else if (ms > 0) {
      this.frameElapsed += ms;
      this.frameCount++;
      if (this.frameElapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / this.frameElapsed);
        this.frameElapsed = 0;
        this.frameCount = 0;
      }
    }
    const stalled = active && age > 250;
    if (stalled && !this.inStall) this.stalls++;
    this.inStall = stalled;
  }
  updatePing(online) {
    const stale = performance.now() - this.lastPong > 5000;
    for (const id of ['menu-fps', 'race-fps']) {
      const el = document.getElementById(id);
      if (el) el.textContent = this.fps === null ? 'FPS —' : `FPS ${this.fps}`;
    }
    for (const id of ['connection-label', 'race-ping']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = !online
        ? 'Offline'
        : this.ping === null
          ? 'Ping —'
          : stale
            ? 'Ping …'
            : `Ping ${Math.round(this.ping)} ms`;
      el.dataset.quality =
        !online || stale ? 'poor' : this.ping > 250 ? 'poor' : this.ping > 120 ? 'fair' : 'good';
      el.title = 'Server round-trip latency';
    }
  }
  report(context) {
    const now = performance.now();
    if (now - this.started < 10000) return;
    const report = {
      version: NETWORK_VERSION,
      at: new Date().toISOString(),
      windowMs: Math.round(now - this.started),
      ...context,
      stalls: this.stalls,
    };
    for (const [key, samples] of Object.entries(this.metrics)) {
      report[key] = samples.summary();
      samples.reset();
    }
    this.latest.push(report);
    if (this.latest.length > 12) this.latest.shift();
    if (this.devLogs) console.info('[net-client]', JSON.stringify(report));
    // Small, numeric-only reports are mirrored into Render logs, so phone
    // diagnostics do not require Safari's remote developer console.
    this.send({
      type: 'net-report',
      metrics: {
        rttMs: report.rttMs.p50,
        rttMaxMs: report.rttMs.max,
        gapP95Ms: report.snapshotGapMs.p95,
        gapMaxMs: report.snapshotGapMs.max,
        frameP95Ms: report.frameMs.p95,
        correctionP95M: report.correctionM.p95,
        correctionMaxM: report.correctionM.max,
        replayP95: report.replaySteps.p95,
        stalls: this.stalls,
        hidden: document.hidden ? 1 : 0,
        bufferMs: context.bufferMs || 0,
        underruns: context.underruns || 0,
      },
    });
    this.started = now;
    this.stalls = 0;
  }
  export() {
    return JSON.stringify(
      { version: NETWORK_VERSION, server: this.server, reports: this.latest },
      null,
      2,
    );
  }
}
