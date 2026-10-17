import * as THREE from 'three';
import { skyPatch, skyRayGround, skyGroundAt } from '../shared/sky-ground.js';
import { boundedSkyAim, clampSkyAimToTrack } from '../shared/sky-beam.js';
export function advanceSkyCursor(cursor, move, dt) {
  const length = Math.max(1, Math.hypot(move.x, move.y));
  cursor.x = Math.max(-0.82, Math.min(0.82, cursor.x + (move.x / length) * dt * 0.8));
  cursor.y = Math.max(-0.72, Math.min(0.76, cursor.y + (move.y / length) * dt * 0.8));
  return cursor;
}
// Keep position and velocity continuous between network updates, using the same
// critically damped correction as cars. This is visual only; never predict a hit.
export function smoothSkyTarget(previous, target, dt) {
  if (!previous || Math.hypot(target.x - previous.x, target.z - previous.z) > 60)
    return { x: target.x, z: target.z, vx: 0, vz: 0 };
  const omega = 24,
    decay = Math.exp(-omega * dt);
  for (const [axis, velocity] of [
    ['x', 'vx'],
    ['z', 'vz'],
  ]) {
    const offset = previous[axis] - target[axis],
      v = previous[velocity],
      c = v + omega * offset;
    previous[axis] = target[axis] + (offset + c * dt) * decay;
    previous[velocity] = (v - omega * c * dt) * decay;
  }
  return previous;
}
// Remote aiming is visual only: a short playback buffer trades a little marker
// latency for smooth movement without guessing noisy camera-relative velocities.
export class SkyTargetPlayback {
  constructor() {
    this.samples = [];
    this.cursor = null;
  }
  push(target, time) {
    if (!Number.isFinite(time) || time <= (this.samples.at(-1)?.time ?? -Infinity)) return;
    if (
      this.samples.length &&
      Math.hypot(target.x - this.samples.at(-1).x, target.z - this.samples.at(-1).z) > 60
    ) {
      this.samples = [];
      this.cursor = null;
    }
    this.samples.push({ x: target.x, z: target.z, time });
    if (this.samples.length > 12) this.samples.shift();
  }
  sample(time) {
    if (!this.samples.length) return null;
    const first = this.samples[0],
      last = this.samples.at(-1);
    this.cursor = Math.max(this.cursor ?? first.time, Math.min(time - 140, last.time));
    let index = this.samples.findIndex((p) => p.time >= this.cursor);
    if (index < 0) return last;
    if (index === 0) return first;
    const a = this.samples[index - 1],
      b = this.samples[index],
      p = this.samples[index - 2] || a,
      n = this.samples[index + 1] || b,
      span = b.time - a.time,
      t = (this.cursor - a.time) / span,
      t2 = t * t,
      t3 = t2 * t,
      result = {};
    for (const axis of ['x', 'z']) {
      const m0 = (b[axis] - p[axis]) / (b.time - p.time),
        m1 = (n[axis] - a[axis]) / (n.time - a.time);
      const value =
        (2 * t3 - 3 * t2 + 1) * a[axis] +
        (t3 - 2 * t2 + t) * span * m0 +
        (-2 * t3 + 3 * t2) * b[axis] +
        (t3 - t2) * span * m1;
      result[axis] = Math.max(
        Math.min(a[axis], b[axis]),
        Math.min(Math.max(a[axis], b[axis]), value),
      );
    }
    return result;
  }
}
// A bright descending core, a softer sheath and orbiting ion knots are one
// group; all geometry is owned by the strike and released at impact.
export function createSkyStrike(color) {
  const bolt = new THREE.Group();
  bolt.name = 'sky-strike';
  for (const [radius, opacity, tint] of [
    [0.9, 0.12, color],
    [0.3, 0.7, color],
    [0.095, 1, 0xeaffff],
  ]) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.45, radius, 12, 12),
      new THREE.MeshBasicMaterial({
        color: tint,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    bolt.add(mesh);
  }
  const spiral = new THREE.BufferGeometry(),
    vertices = [];
  for (let i = 0; i < 64; i++) {
    const t = i / 63,
      a = t * Math.PI * 8;
    vertices.push(Math.cos(a) * 0.75, (t - 0.5) * 12, Math.sin(a) * 0.75);
  }
  spiral.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  bolt.add(
    new THREE.Line(
      spiral,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
  );
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.75 + i * 0.1, 0.035, 5, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = (i - 1) * 3.4;
    bolt.add(ring);
  }
  return bolt;
}
export class SkyBeamView {
  constructor(scene) {
    this.scene = scene;
    this.targets = new Map();
    this.beams = new Map();
    this.cursor = new THREE.Vector2(0, 0);
    this.aimScreen = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.aim = null;
    this.round = null;
    this.externalCursors = new Map();
    this.externalAims = new Map();
    this.externalRound = null;
  }
  marker(color) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(4096 * 3), 3).setUsage(THREE.DynamicDrawUsage),
    );
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        center: { value: new THREE.Vector2() },
        color: { value: new THREE.Color(color) },
        opacity: { value: 0.5 },
        time: { value: 0 },
      },
      vertexShader: `varying vec2 point;void main(){point=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec2 center;uniform vec3 color;uniform float opacity,time;varying vec2 point;void main(){vec2 p=point-center;float r=length(p);if(r>4.)discard;float ring=smoothstep(3.5,3.7,r);float cross=1.-smoothstep(.08,.16,min(abs(p.x),abs(p.y)));float angle=atan(p.y,p.x);float ticks=step(.87,cos(angle*12.+time));float inner=(1.-smoothstep(.04,.12,abs(r-2.8)))*ticks;float scan=(1.-smoothstep(.08,.22,abs(r-mod(time*1.4,4.))))*.3;float line=max(max(ring,cross*.65),inner);gl_FragColor=vec4(color,opacity*(line*.95+scan+.035));
      #include <colorspace_fragment>
      }`,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    return mesh;
  }
  projectCursor(cursor, move, camera, frame, dt) {
    advanceSkyCursor(cursor, move, dt);
    this.ray.setFromCamera(cursor, camera);
    const hit = skyRayGround(this.ray.ray.origin, this.ray.ray.direction);
    if (!hit) return null;
    const aim = boundedSkyAim(hit, frame);
    if (Math.hypot(aim.x - hit.x, aim.z - hit.z) > 1e-6) {
      this.aimScreen.set(aim.x, skyGroundAt(aim.x, aim.z).y, aim.z).project(camera);
      cursor.set(this.aimScreen.x, this.aimScreen.y);
    }
    return aim;
  }
  update(state, localId, camera, frame, move, dt, externalControls = new Map()) {
    const active = state?.phase === 'racing',
      me = state?.players.find((p) => p.id === localId),
      key = active && me?.eliminated && !me.bot ? state.code + ':' + state.round : null;
    if (key !== this.round) {
      this.round = key;
      this.cursor.set(0, 0);
    }
    this.aim = null;
    if (key) {
      this.aim = this.projectCursor(this.cursor, move, camera, frame, dt);
    }
    const externalRound = active ? `${state.trackId}:${state.round}:${state.startAt}` : null;
    if (this.externalRound !== externalRound) {
      this.externalCursors.clear();
      this.externalRound = externalRound;
    }
    this.externalAims.clear();
    const controlled = new Set();
    if (active)
      for (const p of state.players) {
        const movement = externalControls.get(p.id);
        if (!movement || !p.eliminated || p.bot || p.connected === false) continue;
        controlled.add(p.id);
        let cursor = this.externalCursors.get(p.id);
        if (!cursor) {
          cursor = new THREE.Vector2(0, 0);
          this.externalCursors.set(p.id, cursor);
        }
        const aim = this.projectCursor(cursor, movement, camera, frame, dt);
        if (aim) this.externalAims.set(p.id, aim);
      }
    for (const id of this.externalCursors.keys())
      if (!controlled.has(id)) this.externalCursors.delete(id);
    const present = new Set(),
      time = state?.combatTime ?? state?.time ?? 0,
      roundKey = state?.code + ':' + state?.round + ':' + state?.trackId;
    if (active)
      for (const p of state.players) {
        let target = this.externalAims.get(p.id) || (p.id === localId ? this.aim : p.skyTarget);
        if (p.bot || !p.eliminated || !target) continue;
        present.add(p.id);
        let mesh = this.targets.get(p.id);
        if (!mesh) {
          mesh = this.marker(p.color);
          this.targets.set(p.id, mesh);
        }
        if (mesh.userData.round !== roundKey) {
          mesh.userData.round = roundKey;
          mesh.userData.motion = null;
          mesh.userData.playback = new SkyTargetPlayback();
          mesh.userData.cell = null;
        }
        if (p.id !== localId && !this.externalAims.has(p.id)) {
          const sampleTime =
              state.simulationTick !== undefined ? state.simulationTick * (1000 / 60) : state.time,
            renderTime = state.simulationTick !== undefined ? state.raceTime * 1000 : time;
          mesh.userData.playback.push(target, sampleTime);
          const buffered = mesh.userData.playback.sample(renderTime) || target;
          mesh.userData.motion = smoothSkyTarget(mesh.userData.motion, buffered, dt);
          target = clampSkyAimToTrack(mesh.userData.motion);
        }
        const cell = Math.floor(target.x / 12) + ',' + Math.floor(target.z / 12);
        if (mesh.userData.cell !== cell) {
          mesh.userData.cell = cell;
          const vertices = skyPatch(target.x, target.z);
          let attr = mesh.geometry.attributes.position;
          if (attr.array.length < vertices.length) {
            attr = new THREE.BufferAttribute(
              new Float32Array(3 * 2 ** Math.ceil(Math.log2(vertices.length / 3))),
              3,
            ).setUsage(THREE.DynamicDrawUsage);
            mesh.geometry.setAttribute('position', attr);
          }
          attr.array.set(vertices);
          attr.needsUpdate = true;
          mesh.geometry.setDrawRange(0, vertices.length / 3);
        }
        // Use the same dark, high-contrast player targets on every circuit.
        const cooling = time < p.skyCooldownUntil;
        mesh.material.uniforms.color.value.set(p.color).multiplyScalar(0.45);
        mesh.material.uniforms.time.value = time / 1000;
        mesh.material.uniforms.center.value.set(target.x, target.z);
        mesh.material.uniforms.opacity.value = cooling ? 0.3 : 0.72;
      }
    for (const [id, mesh] of this.targets)
      if (!present.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.targets.delete(id);
      }
    const strikes = new Set();
    if (active)
      for (const strike of state.skyBeams || []) {
        if (time >= strike.impactAt) continue;
        strikes.add(strike.id);
        let bolt = this.beams.get(strike.id);
        if (!bolt) {
          bolt = createSkyStrike(strike.color);
          this.scene.add(bolt);
          this.beams.set(strike.id, bolt);
        }
        const t = Math.max(0, Math.min(1, (time - strike.at) / (strike.impactAt - strike.at)));
        bolt.position.set(strike.x, strike.y + 6 + 80 * (1 - t), strike.z);
        bolt.rotation.y = time * 0.008;
        bolt.scale.x = bolt.scale.z = 0.65 + t * 0.6;
        bolt.children[3].rotation.y = -time * 0.014;
      }
    for (const [id, bolt] of this.beams)
      if (!strikes.has(id)) {
        this.scene.remove(bolt);
        bolt.traverse((o) => {
          o.geometry?.dispose();
          o.material?.dispose();
        });
        this.beams.delete(id);
      }
  }
}
