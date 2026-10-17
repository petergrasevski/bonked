// CPU time measures JavaScript/submission, not asynchronous GPU execution.
// Keep samples from unobscured gameplay so opening Settings doesn't replace them.
export class RenderDiagnostics {
  constructor() {
    this.history = [];
    this.reset();
  }
  reset() {
    this.elapsed = 0;
    this.frames = 0;
    this.cpu = 0;
    this.calls = 0;
    this.triangles = 0;
  }
  sample({ frameMs, cpuMs, info, pixels, active = true }) {
    if (!active || !info || frameMs <= 0 || frameMs > 1000) {
      this.reset();
      return;
    }
    this.elapsed += frameMs;
    this.frames++;
    this.cpu += cpuMs;
    this.calls += info.render.calls;
    this.triangles += info.render.triangles;
    if (this.elapsed < 1000) return;
    this.latest = {
      fps: Math.round((this.frames * 1000) / this.elapsed),
      frameMs: this.elapsed / this.frames,
      cpuMs: this.cpu / this.frames,
      calls: Math.round(this.calls / this.frames),
      triangles: Math.round(this.triangles / this.frames),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixels,
    };
    this.history.push(this.latest);
    if (this.history.length > 60) this.history.shift();
    this.reset();
  }
  label() {
    const s = this.latest;
    return s
      ? `${s.fps} FPS · frame ${s.frameMs.toFixed(1)} ms · JS ${s.cpuMs.toFixed(1)} ms\nWebGL 2 · ${s.calls} draws · ${Math.round(s.triangles / 1000)}k triangles\n${s.geometries} geometries · ${s.textures} textures`
      : 'Collecting render stats…';
  }
}
