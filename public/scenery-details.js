import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { activeTrack, trackAt, terrainAt, SEGMENTS } from '../shared/game.js';
const TAU = Math.PI * 2;
const PALETTES = {
  coast: [0xc8c6b7, 0xae6654, 0x497475, 0x263941, 0xa38d68],
  desert: [0xe6b478, 0xb97c51, 0x577451, 0x47392d, 0x997658],
  ice: [0xe1f4fa, 0xb0443c, 0x326b87, 0x334b5d, 0xa48566],
};
export const SCENERY_TYPES = {
  coast: [
    'lifeguard-tower',
    'beach-loungers',
    'surf-rack',
    'fishing-jetty',
    'bait-shack',
    'kayaks',
    'navigation-buoys',
    'seafood-stall',
    'picnic-deck',
    'rescue-dinghy',
    'diving-platform',
    'lobster-pots',
  ],
  desert: [
    'windpump',
    'pumpjack',
    'solar-array',
    'prospector-camp',
    'fossil-ribs',
    'abandoned-wagon',
    'stone-well',
    'survey-tripod',
    'communications-station',
    'sandstone-arch',
    'agave-garden',
    'fuel-stop',
  ],
  ice: [
    'expedition-tents',
    'research-cabin',
    'radar-dish',
    'snowcat',
    'supply-sled',
    'snowman-family',
    'fishing-hut',
    'ski-rack',
    'weather-station',
    'fuel-cache',
    'ice-crystals',
    'igloo',
  ],
};
const random = (a, b = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
// All parts use a single vertex-colour material after spatial batching.
function kit(group, palette) {
  const [light, accent, secondary, dark, wood] = palette;
  const part = (geo, color, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo);
    m.userData.tint = color;
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  const box = (x, y, z, w, h, d, c = wood) => part(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const cylinder = (x, y, z, r, h, c = wood, top = r, n = 8) =>
    part(new THREE.CylinderGeometry(top, r, h, n), c, x, y, z);
  const ball = (x, y, z, r, c = light) => part(new THREE.IcosahedronGeometry(r, 1), c, x, y, z);
  const rod = (a, b, r = 0.07, c = dark) => {
    const start = new THREE.Vector3(...a),
      end = new THREE.Vector3(...b),
      mid = start.clone().add(end).multiplyScalar(0.5),
      m = cylinder(mid.x, mid.y, mid.z, r, start.distanceTo(end), c);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
    return m;
  };
  const ring = (x, y, z, r, c = dark) => {
    const m = part(new THREE.TorusGeometry(r, 0.12, 4, 12), c, x, y, z);
    return m;
  };
  const crate = (x, z, size = 1) => {
    box(x, size * 0.5, z, size, size, size, wood);
    for (const sign of [-1, 1])
      box(x + sign * size * 0.34, size * 0.5, z, size * 0.09, size * 1.03, size * 1.03, dark);
  };
  const barrel = (x, z, c = accent) => {
    cylinder(x, 0.7, z, 0.5, 1.4, c);
    for (const y of [0.2, 1.2]) cylinder(x, y, z, 0.52, 0.09, dark);
  };
  const hut = (c = accent) => {
    box(0, 1.55, 0, 4, 3.1, 3, c);
    for (const s of [-1, 1]) {
      const roof = box(s * 1.05, 3.5, 0, 2.5, 0.2, 3.8, light);
      roof.rotation.z = -s * 0.32;
    }
    box(-0.9, 1.5, 1.52, 0.9, 1, 0.07, secondary);
    box(0.8, 1.2, 1.55, 0.85, 2.4, 0.12, dark);
    box(0, 1.8, -1.54, 1.8, 0.8, 0.08, secondary);
    for (const side of [-1, 1]) {
      box(side * 2.04, 1.8, 0, 0.08, 0.8, 1.3, secondary);
      for (let row = 0; row < 4; row++)
        box(side * 2.06, 0.5 + row * 0.65, 0, 0.06, 0.06, 2.9, wood);
    }
  };
  const dish = (x = 0, z = 0) => {
    cylinder(x, 1.6, z, 0.18, 3.2, dark);
    const m = part(
      new THREE.SphereGeometry(1.8, 12, 5, 0, TAU, Math.PI * 0.6, Math.PI * 0.4),
      light,
      x,
      4.6,
      z,
    );
    m.rotation.z = 0.5;
    rod([x, 3.3, z], [x + 0.9, 5.4, z], 0.08, accent);
    ball(x + 0.9, 5.4, z, 0.16, accent);
  };
  const tent = (x = 0, z = 0) => {
    const m = cylinder(x, 1.2, z, 2.3, 2.4, accent, 0, 4);
    m.rotation.y = Math.PI / 4;
    box(x, 0.66, z + 1.17, 0.8, 1.3, 0.08, dark);
    for (const s of [-1, 1]) rod([x, 2.4, z], [x + s * 2.8, 0, z + 1.5], 0.035, light);
  };
  return {
    part,
    box,
    cylinder,
    ball,
    rod,
    ring,
    crate,
    barrel,
    hut,
    dish,
    tent,
    light,
    accent,
    secondary,
    dark,
    wood,
  };
}
function coast(k, type) {
  const {
    box,
    cylinder,
    ball,
    rod,
    ring,
    crate,
    barrel,
    hut,
    light,
    accent,
    secondary,
    dark,
    wood,
  } = k;
  if (![5, 6, 9].includes(type)) {
    // Small piled docks sit above the water; no new collidable land is added.
    for (let i = 0; i < 11; i++) box(-3.5 + i * 0.7, -0.12, 0, 0.65, 0.24, 6, wood);
    for (const x of [-3.3, 3.3]) for (const z of [-2.5, 2.5]) cylinder(x, -1.8, z, 0.18, 3.6, dark);
  }
  switch (type) {
    case 0:
      for (const x of [-1.5, 1.5])
        for (const z of [-1, 1]) rod([x, 0, z], [x * 0.8, 2.5, z * 0.8], 0.12, wood);
      box(0, 2.5, 0, 3.4, 0.2, 2.6, light);
      box(0, 3.5, 0, 2.6, 1.8, 1.9, accent);
      box(0, 4.6, 0, 3.7, 0.2, 3, light);
      box(0, 3.7, 1, 2, 0.7, 0.1, dark);
      for (const x of [-0.6, 0.6]) rod([x, 0, 2.3], [x, 2.5, 1.3], 0.06, dark);
      for (let i = 0; i < 6; i++) box(0, 0.25 + i * 0.4, 2.2 - i * 0.16, 1.3, 0.08, 0.16, light);
      ring(1.45, 3.3, 0, 0.45, light).rotation.y = Math.PI / 2;
      break;
    case 1:
      cylinder(0, 1.8, 0, 0.06, 3.6, dark);
      cylinder(0, 3.6, 0, 2.4, 0.75, accent, 0.12, 10);
      for (const x of [-1.9, 1.9]) {
        box(x, 0.5, 0.4, 1, 0.12, 2.7, light);
        const back = box(x, 0.9, -0.85, 1, 0.12, 1.1, secondary);
        back.rotation.x = -0.65;
        for (const z of [-0.6, 1.4]) box(x, 0.25, z, 0.7, 0.5, 0.1, dark);
      }
      break;
    case 2:
      for (const x of [-2.5, 2.5]) {
        cylinder(x, 1.3, 0, 0.12, 2.6, wood);
        box(x, 1.2, 0.65, 0.14, 0.14, 1.6, dark);
      }
      rod([-2.5, 2, 0], [2.5, 2, 0], 0.1, wood);
      for (let i = 0; i < 5; i++) {
        const b = ball(-1.8 + i * 0.9, 1.7, 0.6, 1, i % 2 ? accent : secondary);
        b.scale.set(0.36, 1.75, 0.1);
        b.rotation.z = 0.13;
        box(-1.8 + i * 0.9, 1.7, 0.72, 0.07, 2.3, 0.025, light);
      }
      break;
    case 3:
      for (const x of [-2.8, 0, 2.8]) {
        rod([x, 0, -2], [x, 2, -3.8], 0.06, dark);
        rod([x, 2, -3.8], [x, 0.05, -4.8], 0.015, light);
      }
      crate(-2, 1);
      barrel(1.7, 1, secondary);
      ring(2, 1.2, 2.6, 0.5, accent);
      break;
    case 4:
      hut(secondary);
      box(0, 2.65, 1.65, 3, 0.4, 0.12, light);
      for (let i = 0; i < 3; i++)
        ball(-0.8 + i * 0.8, 2.65, 1.76, 0.16, accent).scale.set(1.7, 0.5, 0.4);
      crate(-2.6, 1);
      break;
    case 5:
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 2,
          h = ball(x, 0.1, 0, 1, i % 2 ? accent : secondary);
        h.scale.set(0.65, 0.3, 2.8);
        ball(x, 0.35, 0, 0.6, dark).scale.set(0.6, 0.12, 1.2);
        rod([x - 0.9, 0.4, -1.1], [x + 0.9, 0.4, 1.1], 0.045, wood);
        for (const s of [-1, 1])
          ball(x + s * 0.9, 0.4, s * 1.1, 0.35, light).scale.set(0.5, 0.15, 1.7);
      }
      break;
    case 6:
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 2.6;
        cylinder(x, 0.05, 0, 0.85, 0.3, accent);
        cylinder(x, 0.7, 0, 0.45, 1.2, i % 2 ? secondary : light, 0.25);
        cylinder(x, 1.55, 0, 0.06, 0.8, dark);
        ball(x, 2, 0, 0.22, accent);
      }
      break;
    case 7:
      box(0, 0.9, 0, 4, 1.8, 2, secondary);
      for (const x of [-2, 2]) cylinder(x, 1.8, 0, 0.1, 3.6, wood);
      box(0, 3.4, 0, 4.8, 0.2, 3, light);
      for (let i = 0; i < 5; i++) box(-1.9 + i * 0.95, 3.52, 0, 0.48, 0.07, 3, accent);
      for (let i = 0; i < 4; i++) ball(-1.4 + i * 0.9, 1.87, 0, 0.4, light).scale.set(1, 0.2, 0.5);
      break;
    case 8:
      box(0, 1.15, 0, 3.4, 0.18, 1.6, light);
      for (const s of [-1, 1]) {
        box(0, 0.6, s * 1.3, 3.8, 0.15, 0.5, secondary);
        rod([s * 1.1, 0, -1.4], [s * 0.6, 1.2, 0], 0.1, wood);
        rod([s * 1.1, 0, 1.4], [s * 0.6, 1.2, 0], 0.1, wood);
      }
      barrel(2.7, -1.5);
      break;
    case 9:
      {
        const hull = ball(0, 0.25, 0, 1, accent);
        hull.scale.set(1.4, 0.45, 2.6);
        const inside = ball(0, 0.55, 0, 1, dark);
        inside.scale.set(1, 0.1, 2);
        box(0, 0.65, 0, 2, 0.12, 0.5, light);
        box(0, 0.4, 2.4, 0.6, 1, 0.45, dark);
        ring(0, 0.75, -1.2, 0.45, light).rotation.x = Math.PI / 2;
      }
      break;
    case 10:
      for (const x of [-1, 1]) for (const z of [-1, 1]) cylinder(x, 1.5, z, 0.1, 3, dark);
      box(0, 3, 0, 2.7, 0.2, 2.7, light);
      box(0, 3.1, -2.4, 0.8, 0.16, 3.1, accent);
      for (let i = 0; i < 8; i++)
        rod([-1.1, 0.3 + i * 0.34, 1.2], [1.1, 0.3 + i * 0.34, 1.2], 0.05, secondary);
      break;
    case 11:
      for (let i = 0; i < 3; i++) {
        const x = -2 + i * 2;
        box(x, 0.45, 0, 1.5, 0.08, 1.5, wood);
        for (let j = 0; j < 4; j++) {
          const r = ring(x, 0.5, -0.6 + j * 0.4, 0.7, dark);
          r.scale.y = 0.7;
        }
        for (const s of [-1, 1]) rod([x + s * 0.5, 0.8, -0.8], [x + s * 0.5, 0.8, 0.8], 0.04, wood);
      }
      for (let i = 0; i < 3; i++)
        ring(0, 0.15 + i * 0.13, 1.9, 0.55 - i * 0.08, light).rotation.x = Math.PI / 2;
      break;
  }
}
function desert(k, type) {
  const {
    box,
    cylinder,
    ball,
    rod,
    ring,
    crate,
    barrel,
    hut,
    dish,
    tent,
    light,
    accent,
    secondary,
    dark,
    wood,
  } = k;
  switch (type) {
    case 0:
      for (const s of [-1, 1]) {
        rod([s * 1.5, 0, 0], [s * 0.4, 6, 0], 0.12, dark);
        rod([0, 0, s * 1.5], [0, 6, s * 0.4], 0.12, dark);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8,
          m = box(Math.cos(a) * 1.6, 6 + Math.sin(a) * 1.6, 0, 1.4, 0.45, 0.12, light);
        m.rotation.z = a + 0.25;
      }
      ball(0, 6, 0, 0.3, accent);
      cylinder(2.8, 1, 1, 1.1, 2, accent);
      break;
    case 1:
      for (const s of [-1, 1]) rod([s * 1.4, 0, 0], [0, 3.7, 0], 0.18, dark);
      const beam = box(0, 3.7, 0, 5, 0.35, 0.5, accent);
      beam.rotation.z = 0.18;
      box(-2.4, 3.2, 0, 0.75, 1.6, 0.7, dark);
      rod([-2.6, 2.8, 0], [-2.6, 0.2, 0], 0.06, dark);
      cylinder(2, 0.9, 0, 0.85, 0.55, dark).rotation.x = Math.PI / 2;
      barrel(2, -2);
      break;
    case 2:
      for (const z of [-1.7, 1.7]) {
        for (const x of [-1.6, 1.6]) cylinder(x, 0.8, z, 0.08, 1.6, dark);
        const p = box(0, 1.7, z, 4.8, 0.12, 2.5, secondary);
        p.rotation.x = 0.3;
        for (let i = -2; i <= 2; i++)
          rod([i * 0.9, 1.7 - 0.37, z + 1.2], [i * 0.9, 1.7 + 0.37, z - 1.2], 0.025, light);
      }
      break;
    case 3:
      tent(-1);
      crate(2.2, 1);
      barrel(2, -1.5);
      for (let i = 0; i < 7; i++)
        ball(1.4 + Math.cos(i) * 0.65, 0.15, 3 + Math.sin(i) * 0.65, 0.22, dark);
      rod([0.8, 0.3, 3], [2, 0.3, 3], 0.12, wood);
      break;
    case 4:
      rod([-3, 0.3, 0], [3, 0.4, 0], 0.22, light);
      for (let i = 0; i < 5; i++) {
        const r = ring(-2 + i, 0.6, 0, 1.4 - Math.abs(2 - i) * 0.16, light);
        r.rotation.y = Math.PI / 2;
        r.scale.x = 1.3;
      }
      const skull = ball(3.3, 0.6, 0, 0.8, light);
      skull.scale.set(1.5, 0.65, 0.7);
      for (const s of [-1, 1]) ball(3.6, 0.85, s * 0.38, 0.18, dark);
      break;
    case 5:
      box(0, 1, 0, 3.5, 0.25, 2, wood);
      for (const x of [-1.3, 1.3])
        for (const z of [-1.15, 1.15]) {
          ring(x, 0.65, z, 0.65, dark);
          for (let j = 0; j < 4; j++) {
            const a = (j * Math.PI) / 4;
            rod(
              [x - Math.cos(a) * 0.6, 0.65 - Math.sin(a) * 0.6, z],
              [x + Math.cos(a) * 0.6, 0.65 + Math.sin(a) * 0.6, z],
              0.035,
              wood,
            );
          }
        }
      for (let i = 0; i < 3; i++)
        for (const s of [-1, 1]) box(0, 1.3 + i * 0.25, s, 3.5, 0.16, 0.12, wood);
      rod([1.5, 1, 0], [4, 0.3, 0], 0.1, wood);
      break;
    case 6:
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12,
          b = box(Math.cos(a), 0.5, Math.sin(a), 0.52, 1, 0.5, light);
        b.rotation.y = -a;
      }
      for (const s of [-1, 1]) cylinder(s * 1.5, 1.9, 0, 0.13, 3.8, wood);
      rod([-1.5, 3.4, 0], [1.5, 3.4, 0], 0.15, wood);
      rod([0, 3.4, 0], [0, 0.7, 0], 0.035, dark);
      cylinder(0, 1, 0, 0.35, 0.55, dark);
      break;
    case 7:
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        rod([Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5], [0, 2.5, 0], 0.09, accent);
      }
      box(0, 2.7, 0, 0.7, 0.5, 0.6, light);
      cylinder(0, 2.85, 0, 0.18, 1.2, dark).rotation.z = Math.PI / 2;
      crate(2, 1.5);
      for (let i = 0; i < 3; i++) {
        cylinder(-2 + i * 0.7, 0.7, 2, 0.035, 1.4, dark);
        box(-1.8 + i * 0.7, 1.3, 2, 0.4, 0.25, 0.03, accent);
      }
      break;
    case 8:
      dish(-1);
      box(2, 0.7, 1, 1.5, 1.4, 1.4, secondary);
      for (let j = 0; j < 5; j++) box(2, 0.3 + j * 0.2, 1.72, 1, 0.06, 0.03, dark);
      break;
    case 9:
      for (const s of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const b = ball(s * (2.5 - i * 0.25), 0.9 + i * 1.1, 0, 1.3, i % 2 ? accent : light);
          b.scale.set(1, 1.2, 0.8);
        }
      const top = ball(0, 4.8, 0, 1.7, light);
      top.scale.set(1.8, 0.6, 0.8);
      break;
    case 10:
      for (let j = 0; j < 4; j++) {
        const x = Math.cos(j * 2) * 2,
          z = Math.sin(j * 2) * 2;
        for (let i = 0; i < 7; i++) {
          const a = (i * TAU) / 7;
          rod([x, 0.15, z], [x + Math.cos(a) * 1.3, 0.65, z + Math.sin(a) * 1.3], 0.13, secondary);
        }
        cylinder(x, 0.65, z, 0.27, 1.3, secondary, 0.05);
      }
      break;
    case 11:
      hut(light);
      for (const x of [-2.8, 2.8]) {
        box(x, 0.7, 2, 0.75, 1.4, 0.65, accent);
        box(x, 1.35, 2.35, 0.5, 0.35, 0.04, dark);
        rod([x + 0.45, 1.4, 2], [x + 0.65, 0.25, 2], 0.05, dark);
      }
      box(0, 3.2, 2.5, 6, 0.18, 2.8, accent);
      for (const x of [-2.8, 2.8]) cylinder(x, 1.6, 3.5, 0.08, 3.2, dark);
      break;
  }
}
function ice(k, type) {
  const {
    part,
    box,
    cylinder,
    ball,
    rod,
    ring,
    crate,
    barrel,
    hut,
    dish,
    tent,
    light,
    accent,
    secondary,
    dark,
    wood,
  } = k;
  switch (type) {
    case 0:
      tent(-1.8);
      tent(2, 1);
      crate(0, 3);
      break;
    case 1:
      hut(secondary);
      box(0, 0.15, 0, 4.7, 0.3, 3.7, dark);
      cylinder(-1, 4.3, -0.6, 0.035, 2, accent);
      box(-0.7, 5.1, -0.6, 0.6, 0.3, 0.04, light);
      break;
    case 2:
      dish();
      for (const x of [-2, 2]) crate(x, 1.5);
      break;
    case 3:
      for (const z of [-1.15, 1.15]) {
        box(0, 0.4, z, 3.8, 0.8, 0.65, dark);
        for (let i = 0; i < 5; i++)
          cylinder(-1.4 + i * 0.7, 0.4, z, 0.27, 0.7, wood).rotation.x = Math.PI / 2;
      }
      box(0, 1, 0, 3.6, 0.7, 2, accent);
      box(0.55, 1.9, 0, 1.9, 1.2, 1.8, secondary);
      box(0.55, 2.6, 0, 2.2, 0.18, 2.1, light);
      box(1.52, 2, 0, 0.05, 0.7, 1.5, dark);
      for (const side of [-1, 1]) {
        box(0.55, 2, side * 0.91, 1.35, 0.65, 0.04, dark);
        ball(1.86, 1.12, side * 0.68, 0.14, light);
        rod([1.7, 0.5, side * 0.7], [2.3, 0.35, side * 0.7], 0.09, dark);
      }
      box(2.3, 0.35, 0, 0.3, 0.7, 3.4, light);
      break;
    case 4:
      for (const z of [-0.8, 0.8]) {
        box(0, 0.12, z, 4, 0.15, 0.15, dark);
        rod([2, 0.12, z], [2.5, 0.5, z], 0.07, dark);
      }
      box(0, 0.5, 0, 3.2, 0.15, 1.8, wood);
      crate(-0.8, 0);
      barrel(0.8, 0, secondary);
      rod([2.5, 0.5, -0.8], [3.7, 0.8, 0], 0.045, dark);
      rod([2.5, 0.5, 0.8], [3.7, 0.8, 0], 0.045, dark);
      break;
    case 5:
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 2,
          s = i === 1 ? 1 : 0.7;
        ball(x, s * 0.75, 0, s * 0.8);
        ball(x, s * 1.7, 0, s * 0.55);
        ball(x, s * 2.45, 0, s * 0.4);
        cylinder(x, s * 2.88, 0, s * 0.45, 0.12, dark);
        cylinder(x, s * 3.08, 0, s * 0.28, 0.4, dark);
        for (const sign of [-1, 1]) {
          ball(x + sign * s * 0.14, s * 2.53, s * 0.35, 0.06, dark);
          rod([x + sign * 0.4, s * 1.7, 0], [x + sign * 1.1, s * 2.1, 0], 0.045, wood);
        }
        cylinder(x, s * 1.99, 0, s * 0.51, 0.15, accent);
        rod([x, s * 2.4, s * 0.35], [x, s * 2.4, s * 0.75], 0.09, accent);
      }
      break;
    case 6:
      hut(accent);
      cylinder(2.7, 0.04, 2, 0.65, 0.04, dark, undefined, 12);
      rod([2.5, 0.4, 1], [2.8, 1.4, 2.8], 0.04, wood);
      rod([2.8, 1.4, 2.8], [2.7, 0.1, 2], 0.015, dark);
      box(2.5, 0.35, 0.5, 0.7, 0.7, 0.7, secondary);
      break;
    case 7:
      for (const x of [-2.5, 2.5]) cylinder(x, 1, 0, 0.12, 2, wood);
      rod([-2.5, 1.6, 0], [2.5, 1.6, 0], 0.1, wood);
      for (let i = 0; i < 6; i++) {
        const x = -2 + i * 0.8;
        box(x, 1.5, 0.4, 0.18, 3, 0.09, i % 2 ? accent : secondary).rotation.z = 0.16;
        rod([x + 0.22, 0, 0.8], [x + 0.5, 2.5, 0.6], 0.025, dark);
      }
      break;
    case 8:
      cylinder(0, 3, 0, 0.1, 6, dark);
      box(0, 2, 0, 0.9, 0.8, 0.6, light);
      rod([-1, 5.7, 0], [1, 5.7, 0], 0.05, dark);
      for (const s of [-1, 1]) ball(s, 5.7, 0, 0.23, secondary);
      rod([0, 6, 0], [1.5, 6, 0], 0.035, dark);
      box(1.1, 6.2, 0, 0.65, 0.4, 0.05, accent);
      for (const s of [-1, 1]) rod([0, 3, 0], [s * 2, 0, 1], 0.025, light);
      break;
    case 9:
      for (let i = 0; i < 4; i++) barrel(-1.8 + i * 1.2, 0, i % 2 ? secondary : accent);
      crate(-1, 2);
      crate(1, 2);
      box(0, 0.06, 0, 5, 0.12, 2.4, wood);
      break;
    case 10:
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4,
          x = Math.cos(a) * 1.8,
          z = Math.sin(a) * 1.8,
          h = 1.5 + (i % 3) * 1.1,
          m = cylinder(x, h * 0.5, z, 0.5, h, i % 2 ? light : 0x8dcddd, 0, 5);
        m.rotation.z = Math.sin(a) * 0.25;
      }
      break;
    case 11:
      part(new THREE.SphereGeometry(2.7, 12, 6, 0, TAU, 0, Math.PI / 2), light);
      for (let row = 0; row < 3; row++)
        for (let j = 0; j < 10; j++) {
          const a = (j * TAU) / 10 + row * 0.25,
            r = Math.sqrt(2.7 ** 2 - (0.4 + row * 0.65) ** 2);
          const m = box(
            Math.cos(a) * r,
            0.4 + row * 0.65,
            Math.sin(a) * r,
            0.04,
            0.5,
            0.06,
            secondary,
          );
          m.rotation.y = -a;
        }
      const entrance = ball(0, 0.8, 2.5, 1.05, light);
      entrance.scale.z = 1.25;
      box(0, 0.65, 3.45, 1.05, 1.3, 0.1, dark);
      break;
  }
}
// Check every road segment, including both decks at the desert crossing.
export function sceneryRoadClear(x, z, radius) {
  return !SEGMENTS.some((s) => {
    const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / (s.len * s.len)));
    return (
      Math.hypot(x - s.x - s.dx * t, z - s.z - s.dz * t) <
      s.halfWidth + (s.nextHalfWidth - s.halfWidth) * t + radius + 3
    );
  });
}
export function buildSceneryDetails(w) {
  const id = activeTrack.id,
    palette = PALETTES[id],
    root = new THREE.Group(),
    placed = [],
    reserved = [];
  w.static.updateMatrixWorld(true);
  // Reserve existing grouped landmarks, islands, buildings and mountains.
  for (const g of w.static.children)
    if (g.isGroup && g.children.length) {
      const b = new THREE.Box3().setFromObject(g);
      if (!b.isEmpty()) reserved.push(b);
    }
  for (let slot = 0; slot < 36; slot++) {
    const type = slot % 12,
      radius = 6,
      water = id === 'coast' && [5, 6, 9].includes(type);
    let spot;
    for (let attempt = 0; attempt < 100; attempt++) {
      const fraction = (slot / 36 + 0.013 + Math.floor(attempt / 10) * 0.007) % 1,
        p = trackAt(fraction),
        side = attempt % 2 ? -1 : 1,
        d = p.halfWidth + radius + 8 + Math.floor((attempt % 10) / 2) * 7,
        x = p.x + p.nx * d * side,
        z = p.z + p.nz * d * side;
      if (
        !sceneryRoadClear(x, z, radius) ||
        reserved.some(
          (b) =>
            x + radius > b.min.x &&
            x - radius < b.max.x &&
            z + radius > b.min.z &&
            z - radius < b.max.z,
        ) ||
        placed.some((q) => Math.hypot(x - q.x, z - q.z) < radius + q.radius + 3)
      )
        continue;
      if (id === 'ice' && Math.abs(x) < 490 && Math.abs(z) < 64) continue; // Keep the river valley open.
      const surface = terrainAt(x, z),
        y = id === 'coast' ? (water ? -1.8 : -0.25) : (surface?.y ?? -4);
      if (id === 'coast' && surface && surface.y > -2.2) continue; // Docks and boats belong in water.
      if (
        id !== 'coast' &&
        [
          [-radius, 0],
          [radius, 0],
          [0, -radius],
          [0, radius],
        ].some(([dx, dz]) => Math.abs((terrainAt(x + dx, z + dz)?.y ?? -4) - y) > 0.35)
      )
        continue;
      spot = {
        x,
        y,
        z,
        angle: -p.angle + (random(slot, 2) - 0.5) * 0.4,
        radius,
        type: SCENERY_TYPES[id][type],
        fraction,
      };
      break;
    }
    if (!spot) continue;
    const g = new THREE.Group();
    g.position.set(spot.x, spot.y, spot.z);
    g.rotation.y = spot.angle;
    g.scale.setScalar(0.9 + random(slot, 4) * 0.2);
    root.add(g);
    const colors = [...palette];
    if (Math.floor(slot / 12) % 2) [colors[1], colors[2]] = [colors[2], colors[1]];
    const k = kit(g, colors);
    ({ coast, desert, ice })[id](k, type);
    placed.push(spot);
  }
  root.updateMatrixWorld(true);
  const chunks = new Map();
  let triangles = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.clone();
    if (geo.index) {
      const indexed = geo;
      geo = geo.toNonIndexed();
      indexed.dispose();
    }
    geo.applyMatrix4(o.matrixWorld);
    const color = new THREE.Color(o.userData.tint),
      colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.deleteAttribute('uv');
    geo.computeBoundingBox();
    const center = geo.boundingBox.getCenter(new THREE.Vector3()),
      key = `${Math.floor(center.x / 70)}:${Math.floor(center.z / 70)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(geo);
    triangles += geo.attributes.position.count / 3;
    o.geometry.dispose();
    o.material.dispose();
  });
  const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      flatShading: true,
      side: THREE.DoubleSide,
    }),
    group = new THREE.Group();
  group.name = 'landscape-details';
  for (const geos of chunks.values()) {
    const geometry = mergeGeometries(geos);
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }
  w.scene.add(group);
  return { group, placements: placed, triangles, batches: chunks.size };
}
