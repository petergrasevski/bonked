import * as THREE from 'three';
import { trackAt, nearestTrack } from '../shared/game.js';

// These finishes share a world-space grain instead of stretching a bitmap over
// each differently sized part. Standard lighting, fog and baked shadows survive.
export function factoryFinish(
  w,
  color,
  { metalness = 0.45, roughness = 0.64, panels = false } = {},
) {
  const key = `factory-finish-${color}-${panels}-${metalness}-${roughness}`;
  if (w.materials.has(key)) return w.materials.get(key);
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    envMapIntensity: 0.8,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec3 factorySurface;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nfactorySurface=(modelMatrix*vec4(transformed,1.)).xyz;',
    );
    shader.fragmentShader = 'varying vec3 factorySurface;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec3 fp=factorySurface;
      float grain=fract(sin(dot(floor(fp*vec3(24.,110.,24.)),vec3(12.9898,78.233,37.719)))*43758.5453);
      float wear=sin(fp.y*87.+sin(fp.x*2.)+sin(fp.z*2.))*.018;
      diffuseColor.rgb*=.91+grain*.16+wear;
      ${
        panels
          ? `vec3 surfaceNormal=abs(normalize(cross(dFdx(fp),dFdy(fp))));
      vec2 face=surfaceNormal.y>.7?fp.xz:(surfaceNormal.x>.7?fp.zy:fp.xy);
      vec2 tile=abs(fract(face/4.)-.5);float seam=smoothstep(.482,.498,max(tile.x,tile.y));
      diffuseColor.rgb*=1.-seam*.27;`
          : ''
      }
    `,
    );
  };
  material.customProgramCacheKey = () => `factory-finish-v1-${panels}`;
  w.materials.set(key, material);
  return material;
}

export const FACTORY_PROP_TYPES = [
  'storage-rack',
  'pressure-bank',
  'cooling-plant',
  'power-station',
  'cable-reels',
  'forklift',
  'parts-hopper',
];
export function factoryPropClear(x, z, radius) {
  const p = nearestTrack(x, z);
  return p.distance > p.halfWidth + radius + 5;
}

function makeProp(w, type, index, m) {
  const g = new THREE.Group();
  g.userData.sceneryKind = type;
  const box = (x, y, z, a, b, c, mat = m.steel) => w.box(x, y, z, a, b, c, mat, g);
  const cyl = (x, y, z, a, b, h, mat = m.steel, n = 12) => w.cylinder(x, y, z, a, b, h, mat, n, g);
  const hose = (x, y, z, r) => {
    const p = w.mesh(new THREE.TorusGeometry(r, 0.13, 5, 16), m.dark, x, y, z, g);
    p.rotation.y = Math.PI / 2;
  };
  // A painted work footprint, drains, corner bollards and safety striping make
  // each prop read as a serviced piece of machinery rather than scattered boxes.
  box(0, 0.035, 0, 14, 0.07, 12, m.concrete);
  for (const z of [-5.6, 5.6]) {
    box(0, 0.09, z, 13, 0.025, 0.13, m.amber);
    for (let x = -5; x <= 5; x += 1.5) box(x, 0.105, z, 0.6, 0.025, 0.16, m.dark);
  }
  if (type === 'storage-rack') {
    for (const x of [-5, 5])
      for (const z of [-3.1, 3.1]) {
        box(x, 6, z, 0.35, 12, 0.35, m.blue);
        box(x, 0.2, z, 0.9, 0.3, 0.9, m.steel);
      }
    for (const y of [1, 5, 9]) {
      for (const z of [-3.2, 3.2]) box(0, y, z, 10.7, 0.5, 0.25, m.amber);
      box(0, y - 0.1, 0, 10.5, 0.15, 6.5, m.steel);
      for (let slot = 0; slot < 3; slot++) {
        const x = -3.5 + slot * 3.5;
        box(x, y + 0.35, 0, 3, 0.45, 5.6, m.wood);
        box(x, y + 1.65, 0, 2.8, 2.2, 4.8, slot % 2 ? m.cream : m.blue);
        for (const dx of [-0.9, 0.9]) box(x + dx, y + 1.65, 0, 0.12, 2.25, 4.9, m.dark);
      }
    }
    for (const x of [-5, 5]) {
      const brace = box(x, 6, 0, 0.15, 0.15, 13, m.steel);
      brace.rotation.x = 0.5;
    }
  } else if (type === 'pressure-bank') {
    for (const x of [-3.4, 3.4]) {
      cyl(x, 5, 0, 2, 2, 9, m.cream, 16);
      cyl(x, 9.5, 0, 0.6, 2, 1, m.cream, 16);
      for (const y of [1.3, 7.7]) cyl(x, y, 0, 2.08, 2.08, 0.22, m.steel, 16);
      cyl(x, 10.5, 0, 0.3, 0.3, 1.2, m.amber);
      box(x, 3, 2.2, 0.35, 0.35, 1.4, m.steel);
      const valve = w.mesh(new THREE.TorusGeometry(0.65, 0.1, 5, 12), m.amber, x, 3, 2.9, g);
      box(x, 3, 2.9, 1.2, 0.1, 0.1, m.amber);
      valve.rotation.x = 0;
    }
    box(0, 1.2, 0, 11, 0.35, 0.5, m.blue);
    box(0, 2, -3, 9, 0.3, 0.3, m.blue);
    box(0, 4, 2, 1.4, 3, 1, m.steel);
    box(0, 4.4, 2.52, 0.95, 0.7, 0.05, m.screen);
  } else if (type === 'cooling-plant') {
    box(0, 3.5, 0, 10, 7, 7, m.cream);
    box(0, 0.4, 0, 10.6, 0.6, 7.6, m.dark);
    for (const x of [-2.6, 2.6]) {
      const rim = cyl(x, 7.15, 0, 2, 2, 0.35, m.dark, 20);
      rim.rotation.x = 0;
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const blade = box(x + Math.cos(a) * 0.8, 7.4, Math.sin(a) * 0.8, 1.8, 0.08, 0.38, m.steel);
        blade.rotation.y = -a + 0.4;
      }
      cyl(x, 7.48, 0, 0.45, 0.45, 0.2, m.amber);
    }
    for (let y = 1.1; y < 6.5; y += 0.5) box(0, y, 3.53, 8.6, 0.14, 0.08, m.dark);
    for (const x of [-5.15, 5.15]) {
      box(x, 2, 0, 0.3, 3.4, 0.4, m.blue);
      hose(x, 2.8, 0, 1);
    }
  } else if (type === 'power-station') {
    for (let j = 0; j < 3; j++) {
      const x = -3.8 + j * 3.8;
      box(x, 3.8, 0, 3.4, 7.4, 3.2, m.blue);
      box(x, 3.8, 1.64, 3, 7, 0.1, m.steel);
      box(x + 0.95, 3.8, 1.75, 0.12, 0.8, 0.12, m.cream);
      box(x, 5.9, 1.72, 1.8, 0.9, 0.04, m.screen);
      for (let i = 0; i < 7; i++) box(x, 1.4 + i * 0.22, 1.72, 2, 0.07, 0.05, m.dark);
      for (let i = 0; i < 3; i++)
        cyl(
          x - 0.7 + i * 0.7,
          4.7,
          1.8,
          0.1,
          0.1,
          0.08,
          i === 0 ? m.amber : m.cream,
          8,
        ).rotation.x = Math.PI / 2;
      box(x, 7.9, 0, 0.4, 0.9, 0.5, m.dark);
    }
    box(0, 8.4, 0, 11, 0.3, 0.7, m.steel);
    for (const x of [-4, 4]) hose(x, 1.7, -2.3, 1.2);
  } else if (type === 'cable-reels') {
    for (let i = 0; i < 3; i++) {
      const x = -4 + i * 4,
        z = i % 2 ? 1.6 : -1.2;
      for (const dz of [-1.05, 1.05]) {
        const flange = cyl(x, 2.1, z + dz, 2, 2, 0.2, m.wood, 16);
        flange.rotation.x = Math.PI / 2;
      }
      const roll = cyl(x, 2.1, z, 1.5, 1.5, 2, m.dark, 20);
      roll.rotation.x = Math.PI / 2;
      for (let j = 0; j < 6; j++) {
        const ring = w.mesh(
          new THREE.TorusGeometry(1.5, 0.075, 3, 12),
          m.steel,
          x,
          2.1,
          z - 0.8 + j * 0.32,
          g,
        );
        ring.rotation.z = 0;
      }
      box(x, 0.3, z, 3.8, 0.5, 3.1, m.wood);
    }
  } else if (type === 'forklift') {
    box(0, 1.7, 0, 5, 2.3, 3.4, m.amber);
    box(-1.8, 2.8, 0, 1.6, 1.1, 3.1, m.amber);
    box(0.3, 3.1, 0, 1.4, 0.5, 1.5, m.dark);
    box(-0.3, 3.8, 0, 0.4, 1.4, 1.5, m.dark);
    for (const x of [-1.7, 1.7])
      for (const z of [-1.8, 1.8]) {
        const wheel = cyl(x, 0.95, z, 0.9, 0.9, 0.55, m.dark, 12);
        wheel.rotation.x = Math.PI / 2;
        const hub = cyl(x, 0.95, z + Math.sign(z) * 0.3, 0.4, 0.4, 0.07, m.steel);
        hub.rotation.x = Math.PI / 2;
      }
    for (const z of [-1.4, 1.4]) {
      box(2.5, 3.8, z, 0.4, 7.4, 0.4, m.dark);
      box(3.8, 0.45, z, 3.2, 0.22, 0.45, m.steel);
      box(2.9, 1.6, z, 0.25, 2.6, 0.4, m.steel);
      for (const x of [-1.8, 1.7]) box(x, 4.4, z, 0.18, 3.4, 0.18, m.steel);
    }
    box(0, 6.2, 0, 4.6, 0.25, 3.5, m.amber);
    box(-2.55, 3.3, 0, 0.15, 0.6, 2.2, m.cream);
  } else {
    box(0, 1.3, 0, 8, 2.2, 6, m.blue);
    box(0, 3.1, 0, 10, 1.5, 7.5, m.blue);
    box(0, 3.9, 0, 9.5, 0.2, 7, m.dark);
    for (const x of [-3, 3]) for (const z of [-2.3, 2.3]) box(x, 0.5, z, 0.6, 1, 0.6, m.steel);
    for (let j = 0; j < 15; j++) {
      const x = Math.sin(j * 17 + index) * 3.6,
        z = Math.cos(j * 31 + index) * 2.6;
      const part = box(x, 4.1 + (j % 3) * 0.2, z, 1.6, 0.5, 0.7, j % 2 ? m.steel : m.cream);
      part.rotation.y = j * 2.4;
    }
    for (const x of [-4.9, 4.9]) box(x, 3.25, 0, 0.18, 1, 7.5, m.amber);
  }
  return g;
}

export function buildFactoryDressing(w, reservations = []) {
  const m = {
    steel: factoryFinish(w, 0x566772),
    dark: factoryFinish(w, 0x1a2b34),
    blue: factoryFinish(w, 0x40778f, { panels: true }),
    cream: factoryFinish(w, 0xb4bdb1, { panels: true }),
    amber: factoryFinish(w, 0xeab653),
    wood: factoryFinish(w, 0x887254, { metalness: 0, roughness: 0.95 }),
    concrete: factoryFinish(w, 0x47545a, { metalness: 0.03, roughness: 0.94 }),
    screen: w.mat(0x70c0c6),
  };
  const occupied = [];
  // Stable choices per circuit fraction; no per-frame placement or physics work.
  for (let i = 0; i < 56; i++) {
    const p = trackAt((i + 0.55) / 56),
      side = i % 2 ? 1 : -1;
    for (const offset of [32, 52, 76, 104]) {
      const d = p.halfWidth + offset,
        x = p.x + p.nx * d * side,
        z = p.z + p.nz * d * side,
        radius = 10;
      if (
        Math.abs(x) > 376 ||
        z < -266 ||
        z > 286 ||
        !factoryPropClear(x, z, radius) ||
        [...occupied, ...reservations].some(
          (q) => Math.hypot(q.x - x, q.z - z) < radius + q.radius + 3,
        )
      )
        continue;
      const type = FACTORY_PROP_TYPES[occupied.length % FACTORY_PROP_TYPES.length],
        g = makeProp(w, type, i, m);
      g.position.set(x, -7.92, z);
      g.rotation.y = -p.angle + (i % 3 === 0 ? Math.PI : 0);
      w.static.add(g);
      occupied.push({ x, z, radius, type });
      break;
    }
  }
  return occupied;
}
