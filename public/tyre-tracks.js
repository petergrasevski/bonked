import * as THREE from 'three';
import { CAR_LENGTH, CAR_WIDTH, activeTrack, roadSurfaceAt } from '../shared/game.js';
const CAPACITY = 2048,
  LIFE = 4,
  SAMPLE = 1 / 30;
const clamp = (v) => Math.max(0, Math.min(1, v));
const grounded = (c) =>
  !c.eliminated &&
  !c.finished &&
  !c.falling &&
  !c.overturned &&
  !c.wrecked &&
  Math.abs((c.y || 0) - (c.groundY || 0)) < 0.15 &&
  Math.abs(c.roll || 0) < 0.3;
// A fixed ring of joined rear-tyre ribbons: one draw call, no per-mark meshes.
export function createTyreTracks() {
  const geometry = new THREE.BufferGeometry();
  for (const [name, size] of [
    ['position', 3],
    ['uv', 2],
    ['born', 1],
    ['strength', 1],
  ])
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(new Float32Array(CAPACITY * 6 * size), size).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    uniforms: {
      time: { value: 0 },
      color: {
        value: new THREE.Color(
          activeTrack.id === 'ice' ? 0x657f89 : activeTrack.id === 'desert' ? 0x63513c : 0x101415,
        ),
      },
      opacity: {
        value: activeTrack.id === 'ice' ? 0.22 : activeTrack.id === 'desert' ? 0.43 : 0.65,
      },
    },
    vertexShader: `attribute float born,strength;varying float birth,pressure;varying vec2 vUv;void main(){birth=born;pressure=strength;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time,opacity;uniform vec3 color;varying float birth,pressure;varying vec2 vUv;void main(){float age=(time-birth)/4.;if(age>=1.)discard;float edge=1.-smoothstep(.7,1.,abs(vUv.y*2.-1.));float grooves=1.-.42*pow(.5+.5*cos(vUv.y*25.13274),12.);float grain=.92+.08*sin(vUv.x*43.+sin(vUv.y*31.));float fade=1.-smoothstep(.35,1.,age);gl_FragColor=vec4(color,opacity*pressure*edge*grooves*grain*fade);
    #include <colorspace_fragment>
    }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'drift-tyre-tracks';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  const records = new Map();
  let next = 0,
    count = 0,
    last = -Infinity;
  function section(car, side, now, strength, distance) {
    const fx = Math.cos(car.angle),
      fz = Math.sin(car.angle),
      x = car.x - fx * CAR_LENGTH * 0.3 - fz * side * CAR_WIDTH * 0.43,
      z = car.z - fz * CAR_LENGTH * 0.3 + fx * side * CAR_WIDTH * 0.43;
    const points = [
      { x: x + fz * 0.14, z: z - fx * 0.14 },
      { x: x - fz * 0.14, z: z + fx * 0.14 },
    ];
    for (const p of points) {
      const road = roadSurfaceAt(p.x, p.z, car.trackFraction);
      if (!road) return null;
      p.y = road.y + 0.025;
    }
    return { points, x, z, now, strength, distance };
  }
  function write(a, b) {
    const attrs = geometry.attributes;
    for (const [i, corner] of [0, 2, 1, 2, 3, 1].entries()) {
      const s = corner < 2 ? a : b,
        p = s.points[corner % 2],
        v = next * 6 + i;
      attrs.position.setXYZ(v, p.x, p.y, p.z);
      attrs.uv.setXY(v, s.distance, corner % 2);
      attrs.born.setX(v, s.now);
      attrs.strength.setX(v, s.strength);
    }
    next = (next + 1) % CAPACITY;
    count = Math.min(CAPACITY, count + 1);
    last = b.now;
  }
  return {
    mesh,
    reset() {
      records.clear();
      next = count = 0;
      last = -Infinity;
      mesh.visible = false;
      geometry.setDrawRange(0, 0);
    },
    update(now, cars) {
      material.uniforms.time.value = now;
      const present = new Set();
      let dirty = false;
      for (const car of cars) {
        present.add(car.id);
        let r = records.get(car.id);
        if (!r) {
          r = { at: now - SAMPLE, x: car.x, z: car.z, strength: 0, wheels: [null, null] };
          records.set(car.id, r);
        }
        const elapsed = now - r.at;
        if (elapsed < SAMPLE - 1e-6) continue;
        const moved = Math.hypot(car.x - r.x, car.z - r.z),
          speed = Math.hypot(car.vx || 0, car.vz || 0),
          slip = Math.abs(
            -(car.vx || 0) * Math.sin(car.angle) + (car.vz || 0) * Math.cos(car.angle),
          );
        // A boost alone is not a skid. Suppress nudges here; they have four-wheel feedback.
        const valid =
          grounded(car) &&
          !car.nudgeMoved &&
          !(car.nudgeTime > 0) &&
          elapsed < 0.2 &&
          moved < Math.max(2, speed * elapsed * 2 + 0.5);
        const target = valid ? clamp((slip - 2.8) / 7) * clamp((speed - 6) / 6) : 0;
        r.strength += (target - r.strength) * (1 - Math.exp(-elapsed / 0.1));
        if (!valid || (target === 0 && r.strength < 0.015)) {
          r.strength = 0;
          r.wheels = [null, null];
        } else
          for (let i = 0; i < 2; i++) {
            const a = r.wheels[i],
              b = section(car, i ? 1 : -1, now, a ? r.strength : 0, a?.distance || 0);
            if (b && a) {
              const length = Math.hypot(b.x - a.x, b.z - a.z);
              b.distance += length;
              // Reject unsupported spans, including the middle of the split ice road.
              if (
                length > 0.025 &&
                (a.strength > 0.015 || b.strength > 0.015) &&
                roadSurfaceAt((a.x + b.x) / 2, (a.z + b.z) / 2, car.trackFraction)
              ) {
                write(a, b);
                dirty = true;
              }
            }
            r.wheels[i] = b;
          }
        r.at = now;
        r.x = car.x;
        r.z = car.z;
      }
      for (const id of records.keys()) if (!present.has(id)) records.delete(id);
      mesh.visible = now - last < LIFE;
      geometry.setDrawRange(0, count * 6);
      if (dirty) for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
    },
  };
}
