import * as THREE from 'three';
import { DESERT_MOUNTAIN } from '../shared/desert-features.js';
import { activeTrack, trackAt, nearestTrack, TRACK_LENGTH, SEGMENTS } from '../shared/game.js';
const C = {
  sand: 0x938d7c,
  cliff: 0x777568,
  cream: 0xc8c6b7,
  coral: 0xae6654,
  navy: 0x263941,
  teal: 0x497475,
  lime: 0xd4f65e,
};
const TAU = Math.PI * 2;
const rand = (seed, n = 0) => {
  const x = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
function geometry(vertices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const uv = [];
  for (let i = 0; i < vertices.length; i += 3) uv.push(vertices[i] / 5, vertices[i + 2] / 5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function triangle(v, a, b, c) {
  v.push(...a, ...b, ...c);
}
function quad(v, a, b, c, d) {
  triangle(v, a, b, c);
  triangle(v, a, c, d);
}
function group(w, x, y, z, kind, parent = w.static) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.userData.sceneryKind = kind;
  parent.add(g);
  return g;
}
function tube(w, points, radius, color, parent, segments = 12) {
  return w.mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      segments,
      radius,
      5,
      false,
    ),
    color,
    0,
    0,
    0,
    parent,
  );
}
// Each contour shares the same harmonics, so beach and bedrock join without seams.
export function islandContour(angle, seed) {
  return (
    1 +
    0.095 * Math.sin(angle * 3 + seed) +
    0.055 * Math.cos(angle * 5 - seed * 0.7) +
    0.025 * Math.sin(angle * 9 + seed * 2)
  );
}
export function createIslandBand(radius, seed, rings, segments = 40) {
  const vertices = [],
    point = (j, r, y) => {
      const a = (j / segments) * TAU,
        coast = islandContour(a, seed);
      return [
        Math.cos(a) * radius * r * coast,
        y + 0.055 * Math.sin(a * 5 + seed) * Math.min(1, r),
        Math.sin(a) * radius * r * coast * 0.87,
      ];
    };
  for (let i = 1; i < rings.length; i++)
    for (let j = 0; j < segments; j++) {
      const [ra, ya] = rings[i - 1],
        [rb, yb] = rings[i];
      quad(
        vertices,
        point(j, ra, ya),
        point(j, rb, yb),
        point(j + 1, rb, yb),
        point(j + 1, ra, ya),
      );
    }
  return geometry(vertices);
}
export function detailedIsland(w, x, z, radius = 6, seed = 0) {
  const g = group(w, x, 0, z, 'island');
  w.mesh(
    createIslandBand(radius, seed, [
      [1.15, -3.6],
      [1.1, -2.15],
      [1, -1.1],
      [0.96, -0.58],
    ]),
    C.cliff,
    0,
    0,
    0,
    g,
  );
  w.mesh(
    createIslandBand(radius, seed, [
      [0.96, -0.58],
      [0.91, -0.29],
      [0.76, -0.16],
    ]),
    C.sand,
    0,
    0,
    0,
    g,
  );
  w.mesh(
    createIslandBand(radius, seed, [
      [0.76, -0.16],
      [0.42, -0.09],
      [0, -0.06],
    ]),
    0x89956a,
    0,
    0,
    0,
    g,
  );
  return g;
}
export function createRockGeometry(size = 1, seed = 1) {
  const g = new THREE.IcosahedronGeometry(size, 2),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / size,
      y = p.getY(i) / size,
      z = p.getZ(i) / size;
    const r =
      1 + 0.12 * Math.sin(x * 7 + seed) * Math.sin(z * 5 - seed) + 0.07 * Math.cos(y * 9 + seed);
    p.setXYZ(i, x * size * r, y * size * r * 0.65, z * size * r * 0.85);
  }
  g.computeVertexNormals();
  return g;
}
export function detailedRock(w, x, z, size, color = C.cliff) {
  const rock = w.mesh(
    createRockGeometry(size, x * 0.31 + z * 0.7),
    color,
    x,
    -0.6 + size * 0.36,
    z,
  );
  rock.rotation.set(0.12, x * 0.7, 0.12);
  rock.userData.sceneryKind = 'rock';
  return rock;
}
export function detailedPalm(w, x, z, scale = 1, angle = 0) {
  const seed = x * 0.7 + z * 0.21,
    g = group(w, x, 0, z, 'palm');
  g.scale.setScalar(scale);
  g.rotation.y = angle;
  const lean = 0.6 + rand(seed) * 0.8,
    trunk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14, 1.8, 0.08),
      new THREE.Vector3(lean * 0.65, 3.7, 0.15),
      new THREE.Vector3(lean, 5.45, 0),
    ]);
  const trunkGeo = new THREE.TubeGeometry(trunk, 18, 0.28, 9, false),
    p = trunkGeo.attributes.position;
  // Taper the curved tube toward its crown while retaining its continuous normal field.
  for (let i = 0; i <= 18; i++) {
    const t = i / 18,
      c = trunk.getPointAt(t),
      taper = 1.3 - t * 0.7;
    for (let j = 0; j <= 9; j++) {
      const k = i * 10 + j;
      p.setXYZ(
        k,
        c.x + (p.getX(k) - c.x) * taper,
        c.y + (p.getY(k) - c.y) * taper,
        c.z + (p.getZ(k) - c.z) * taper,
      );
    }
  }
  trunkGeo.computeVertexNormals();
  w.mesh(trunkGeo, 0x997658, 0, 0, 0, g);
  for (let i = 1; i < 10; i++) {
    const t = i / 10,
      at = trunk.getPointAt(t),
      ring = w.mesh(
        new THREE.TorusGeometry(0.28 * (1.3 - t * 0.7), 0.023, 3, 9),
        0x735635,
        at.x,
        at.y,
        at.z,
        g,
      );
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), trunk.getTangentAt(t));
  }
  const leaves = [[], []],
    crown = [lean, 5.42, 0];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rand(seed, i) * 0.22,
      length = 3.1 + rand(seed, i + 31) * 1.05,
      lift = 0.55 + rand(seed, i + 71) * 0.7,
      drop = 0.7 + rand(seed, i + 91) * 0.7;
    const at = (t, lateral = 0, liftOffset = 0) => [
      crown[0] + Math.cos(a) * length * t - Math.sin(a) * lateral,
      crown[1] + Math.sin(t * Math.PI) * lift - t * t * drop + liftOffset,
      Math.sin(a) * length * t + Math.cos(a) * lateral,
    ];
    // Raised rachis and individually folded, swept leaflets form a feather silhouette.
    for (let j = 0; j < 10; j++) {
      const t = j / 10,
        tn = (j + 1) / 10;
      quad(leaves[i % 2], at(t, -0.025), at(t, 0.025), at(tn, 0.014), at(tn, -0.014));
    }
    for (let j = 0; j < 11; j++) {
      const t = 0.08 + j * 0.075,
        width = Math.sin(t * Math.PI) * 0.7 + 0.1;
      for (const side of [-1, 1]) {
        const base = at(t),
          tip = at(Math.min(1, t + 0.18), side * width, -0.15),
          mid = at(t + 0.09, side * width * 0.57, 0.025),
          front = at(t + 0.022, side * width * 0.35, -0.045),
          back = at(t + 0.1, side * width * 0.3, -0.045);
        for (const tri of [
          [base, front, mid],
          [front, tip, mid],
          [tip, back, mid],
          [back, base, mid],
        ])
          triangle(leaves[i % 2], ...tri);
      }
    }
  }
  for (let i = 0; i < 2; i++) {
    const mat = w.mat(i ? 0x588851 : 0x799851);
    mat.side = THREE.DoubleSide;
    w.mesh(geometry(leaves[i]), mat, 0, 0, 0, g);
  }
  for (let i = 0; i < 3; i++)
    w.mesh(
      new THREE.IcosahedronGeometry(0.23, 1),
      0x735635,
      lean + Math.cos(i * 2.1) * 0.24,
      5.18,
      Math.sin(i * 2.1) * 0.24,
      g,
    );
  return g;
}
function grass(w, parent, seed, radius) {
  const v = [];
  for (let i = 0; i < 24; i++) {
    const a = rand(seed, i) * TAU,
      r = (0.4 + rand(seed, i + 51) * 0.34) * radius,
      x = Math.cos(a) * r,
      z = Math.sin(a) * r * 0.87,
      h = 0.3 + rand(seed, i + 80) * 0.4;
    for (let j = 0; j < 3; j++) {
      const d = (j * TAU) / 3,
        dx = Math.cos(d) * 0.07,
        dz = Math.sin(d) * 0.07;
      triangle(
        v,
        [x - dx, -0.07, z - dz],
        [x + Math.cos(a) * 0.25, h, z + Math.sin(a) * 0.25],
        [x + dx, -0.07, z + dz],
      );
    }
  }
  const mat = w.mat(0x799851);
  mat.side = THREE.DoubleSide;
  w.mesh(geometry(v), mat, 0, 0, 0, parent);
}
function cabin(w, x, z, angle, index) {
  const g = group(w, x, 0, z, 'cabin');
  g.rotation.y = -angle;
  w.box(0, 1.7, 0, 8, 3.4, 6, C.cream, g);
  w.box(0, 3.6, 0, 9, 0.4, 7, index % 8 ? C.coral : C.teal, g);
  w.box(0, 1.8, 3.05, 5.6, 1.6, 0.1, 0x2c6272, g);
  for (let j = -2; j <= 2; j++) w.box(j * 1.1, 1.8, 3.12, 0.1, 1.7, 0.15, C.cream, g);
  w.box(0, 0.1, 5, 12, 0.2, 3, 0xa38d68, g);
  for (let j = 0; j < 14; j++) w.box(-5.65 + j * 0.87, 0.215, 5, 0.035, 0.02, 3, 0x735635, g);
  for (const side of [-1, 1]) {
    w.box(side * 4.04, 1.7, 0, 0.08, 1.5, 2.8, 0x2c6272, g);
    for (let i = 0; i < 6; i++) w.box(side * 4.13, 1.07 + i * 0.25, 0, 0.15, 0.09, 2.9, C.teal, g);
    w.box(side * 4.35, 3.08, 0, 0.13, 0.13, 6.5, C.cream, g);
  }
  for (let j = -1; j <= 1; j++) {
    w.cylinder(j * 3, 1.35, 5, 0.08, 0.08, 2.7, C.cream, 8, g);
    w.mesh(new THREE.ConeGeometry(1.4, 0.55, 16), index % 8 ? C.cream : C.coral, j * 3, 2.7, 5, g);
    w.box(j * 3, 0.5, 5.25, 1.5, 0.12, 0.6, 0x735635, g);
  }
  return g;
}
export function buildDetailedScenery(w, landmarks = []) {
  const count = Math.ceil(TRACK_LENGTH / 24);
  for (let i = 0; i < count; i++) {
    if (
      landmarks.some(
        (l) => Math.abs(((((i / count - l.fraction + 0.5) % 1) + 1) % 1) - 0.5) * TRACK_LENGTH < 45,
      )
    )
      continue;
    const p = trackAt(i / count),
      inside = -(25 + (i % 3) * 5),
      x = p.x + p.nx * inside,
      z = p.z + p.nz * inside;
    if (nearestTrack(x, z).distance < 19) continue;
    const island = detailedIsland(w, x, z, 6, i);
    grass(w, island, i, 6);
    detailedPalm(w, x, z, 0.85 + (i % 4) * 0.13, p.angle);
    for (let j = 0; j < 3; j++)
      detailedRock(
        w,
        p.x + p.nx * (p.halfWidth + 3 + j * 0.8) + Math.cos(p.angle) * j * 3,
        p.z + p.nz * (p.halfWidth + 3 + j * 0.8) + Math.sin(p.angle) * j * 3,
        1.3 + ((i + j) % 3) * 0.6,
      );
    if (i % 4 === 0 && nearestTrack(x - p.nx * 7, z - p.nz * 7).distance > 20) {
      detailedIsland(w, x - p.nx * 7, z - p.nz * 7, 10, i + 100);
      cabin(w, x - p.nx * 7, z - p.nz * 7, p.angle, i);
    }
    if (i % 7 === 0) {
      const px = p.x - p.nx * (p.halfWidth + 3),
        pz = p.z - p.nz * (p.halfWidth + 3);
      w.cylinder(px, 3, pz, 0.11, 0.13, 6, C.navy, 8);
      const flag = w.box(px + 0.7, 5.5, pz, 1.5, 1.1, 0.04, C.lime);
      flag.rotation.y = -p.angle;
    }
    if (i % 9 === 0 && nearestTrack(x - p.nx * 10, z - p.nz * 10).distance > 20) {
      detailedIsland(w, x - p.nx * 10 + 4, z - p.nz * 10, 11, i + 200);
      const g = group(w, x - p.nx * 10, 0, z - p.nz * 10, 'cargo');
      g.rotation.y = -p.angle;
      for (let j = 0; j < 3; j++) {
        w.box(j * 4, 1.4, 0, 3.5, 2.8, 8, [C.coral, C.teal, 0xd2b46e][j], g);
        for (let k = 0; k < 10; k++) w.box(j * 4, 1.4, -3.6 + k * 0.8, 3.6, 0.08, 0.1, C.navy, g);
        for (const side of [-1, 1]) {
          w.box(j * 4 + side * 0.85, 1.4, 4.06, 0.07, 2.45, 0.1, C.cream, g);
          w.box(j * 4 + side * 1.5, 2.8, 0, 0.15, 0.12, 8.04, C.cream, g);
        }
      }
    }
    if (i % 6 === 0) {
      const boat = group(w, p.x + p.nx * 25, -1.8, p.z + p.nz * 25, 'boat');
      boat.rotation.y = -p.angle;
      const hull = w.mesh(new THREE.SphereGeometry(1, 20, 10), C.cream, 0, 0.2, 0, boat);
      hull.scale.set(1, 0.5, 2.4);
      w.box(0, 0.54, 0, 1.35, 0.12, 3.1, 0xa38d68, boat);
      w.cylinder(0, 2, 0, 0.06, 0.08, 4.5, 0xceb787, 8, boat);
      const sail = [],
        rows = 8;
      for (let r = 0; r < rows; r++) {
        const a = r / rows,
          b = (r + 1) / rows,
          pt = (t) => [Math.sin(t * Math.PI) * 0.25, 0.7 + 3.6 * t, 2 * (1 - t)];
        quad(sail, [0, 0.7 + 3.6 * a, 0], pt(a), pt(b), [0, 0.7 + 3.6 * b, 0]);
      }
      const mat = w.mat(C.cream);
      mat.side = THREE.DoubleSide;
      w.mesh(geometry(sail), mat, 0, 0, 0, boat);
      tube(
        w,
        [
          [0, 4.3, 0],
          [0.65, 0.6, 1.4],
        ],
        0.012,
        C.navy,
        boat,
        2,
      );
      tube(
        w,
        [
          [0, 4.3, 0],
          [-0.65, 0.6, 1.4],
        ],
        0.012,
        C.navy,
        boat,
        2,
      );
    }
  }
}
function pine(w, x, z, height, seed) {
  const g = group(w, x, -3.8, z, 'pine');
  w.cylinder(0, height * 0.45, 0, 0.12, 0.32, height * 0.9, 0x735635, 9, g);
  const green = [],
    snow = [];
  for (let tier = 0; tier < 6; tier++) {
    const y = height * (0.24 + tier * 0.125),
      r = height * (0.31 - tier * 0.039);
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU + tier * 0.45 + seed * 0.1,
        len = r * (0.8 + rand(seed, j + tier * 8) * 0.2),
        cs = Math.cos(a),
        sn = Math.sin(a),
        at = (d, h, s = 0) => [cs * d - sn * s, y + h, sn * d + cs * s];
      const root = at(0, 0.5),
        tip = at(len, -0.35),
        left = at(len * 0.48, -0.08, len * 0.27),
        right = at(len * 0.48, -0.08, -len * 0.27),
        ridge = at(len * 0.48, 0.19);
      for (const tri of [
        [root, left, ridge],
        [left, tip, ridge],
        [tip, right, ridge],
        [right, root, ridge],
      ])
        triangle(green, ...tri);
      // Snow sits on separate raised folded boughs, leaving dark tips visible.
      const sr = at(0.05, 0.58),
        st = at(len * 0.88, -0.2),
        sl = at(len * 0.47, 0.025, len * 0.205),
        ss = at(len * 0.47, 0.025, -len * 0.205),
        sh = at(len * 0.43, 0.3);
      for (const tri of [
        [sr, sl, sh],
        [sl, st, sh],
        [st, ss, sh],
        [ss, sr, sh],
      ])
        triangle(snow, ...tri);
    }
  }
  const greenMat = w.mat(0x41615d),
    snowMat = w.mat(0xe1f4fa);
  greenMat.side = snowMat.side = THREE.DoubleSide;
  w.mesh(geometry(green), greenMat, 0, 0, 0, g);
  w.mesh(geometry(snow), snowMat, 0, 0, 0, g);
  return g;
}
function glacier(w, x, z, seed) {
  const g = group(w, x, -3.7, z, 'glacier');
  const base = 6 + (seed % 4);
  // Ridged, asymmetric outcrop replaces a regular pointed cone.
  const bands = [
    [1.1, 0],
    [1, 2],
    [0.8, 5],
    [0.55, 9 + (seed % 5)],
    [0.22, 12 + (seed % 6)],
    [0, 13 + (seed % 5)],
  ];
  w.mesh(createIslandBand(base, seed, bands, 18), 0x8dcddd, 0, 0, 0, g);
  w.mesh(
    createIslandBand(
      base,
      seed,
      [
        [0.8, 5.05],
        [0.55, 9.08 + (seed % 5)],
        [0.22, 12.08 + (seed % 6)],
        [0, 13.08 + (seed % 5)],
      ],
      18,
    ),
    0xe1f4fa,
    0,
    0,
    0,
    g,
  );
  for (let j = 0; j < 3; j++) {
    const shard = w.mesh(
      createRockGeometry(2 + j * 0.7, seed + j),
      j % 2 ? 0xb9dce4 : 0x8dcddd,
      Math.sin(seed + j) * 6,
      2,
      Math.cos(seed + j) * 6,
      g,
    );
    shard.scale.y = 2.2;
  }
  return g;
}
function mesa(w, x, z, index) {
  const height = 14 + (index % 9),
    top = 6 + (index % 5),
    bottom = 12 + (index % 7),
    g = group(w, x, 2 - height / 2, z, 'mesa');
  // Every layer starts on the exact previous contour, including its ledge.
  const ring = (j) => [
    1 + ((top / bottom - 1) * j) / 10 + (j > 0 && j < 10 && j % 3 === 0 ? 0.035 : 0),
    (j / 10) * height,
  ];
  for (let j = 0; j < 10; j++)
    w.mesh(
      createIslandBand(bottom, index, [ring(j), ring(j + 1)], 28),
      [0xa66542, 0xb97c51, 0xd79760][j % 3],
      0,
      0,
      0,
      g,
    );
  w.mesh(
    createIslandBand(
      bottom,
      index,
      [ring(10), [(top / bottom) * 0.82, height + 0.6], [0, height + 0.7]],
      28,
    ),
    0xe6b478,
    0,
    0,
    0,
    g,
  );
  return g;
}
export function cactus(w, x, z, seed, y = -3.8) {
  const g = group(w, x, y, z, 'cactus'),
    height = 5 + rand(seed) * 2;
  w.cylinder(0, height * 0.5, 0, 0.43, 0.57, height, 0x577451, 14, g);
  const cap = w.mesh(new THREE.SphereGeometry(0.43, 12, 6), 0x577451, 0, height, 0, g);
  cap.scale.y = 1.3;
  for (const side of [-1, 1])
    tube(
      w,
      [
        [side * 0.2, height * 0.4, 0],
        [side * 1.3, height * 0.43, 0],
        [side * 1.7, height * 0.56, 0],
        [side * 1.7, height * (side === 1 ? 0.85 : 0.7), 0],
      ],
      0.27,
      0x577451,
      g,
      10,
    );
  for (let j = 0; j < 8; j++) {
    const a = (j / 8) * TAU;
    tube(
      w,
      [
        [Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55],
        [Math.cos(a) * 0.48, height * 0.55, Math.sin(a) * 0.48],
        [Math.cos(a) * 0.42, height, Math.sin(a) * 0.42],
      ],
      0.022,
      0x799851,
      g,
      4,
    );
  }
  return g;
}
export function buildDetailedBiome(w) {
  const ice = activeTrack.id === 'ice';
  for (let i = 0; i < 100; i++) {
    const p = trackAt(i / 100),
      side = i % 2 ? 1 : -1,
      offset = p.halfWidth + 24 + (i % 5) * 13,
      x = p.x + p.nx * offset * side,
      z = p.z + p.nz * offset * side;
    const nearest = nearestTrack(x, z);
    if (
      nearest.distance < 20 ||
      (!ice && nearest.distance - nearest.halfWidth < (12 + (i % 7)) * 1.19 + 1)
    )
      continue;
    if (ice) {
      // Keep the valley's central river and its banks open between the two straights.
      if (Math.abs(x) < 490 && Math.abs(z) < 62) continue;
      glacier(w, x, z, i);
      for (let j = 0; j < 3; j++) {
        const tx = x + Math.sin(i + j * 2.1) * 13,
          tz = z + Math.cos(i + j * 2.1) * 13;
        if (nearestTrack(tx, tz).distance > 15) pine(w, tx, tz, 6 + rand(i, j) * 5, i + j);
      }
    } else {
      // Authored mountains and their open bridge canyon replace random mesas here.
      if (i / 100 > DESERT_MOUNTAIN.start - 0.035 && i / 100 < DESERT_MOUNTAIN.end + 0.035)
        continue;
      if (x > 190 && Math.abs(z) < 92) continue;
      mesa(w, x, z, i);
      for (let j = 0; j < 4; j++) {
        const rx = x + Math.cos(i + j) * 14,
          rz = z + Math.sin(i + j) * 14;
        if (nearestTrack(rx, rz).distance > 10) detailedRock(w, rx, rz, 1.4 + (j % 3), 0xaa7752);
      }
      const cx = x + 14,
        cz = z + 10;
      if (nearestTrack(cx, cz).distance > 15) cactus(w, cx, cz, i);
    }
  }
  if (!ice) {
    buildDesertPylons(w);
  }
}

export function buildDesertPylons(w) {
  const pylons = [];
  for (let i = 0; i < SEGMENTS.length; i += 18) {
    const p = SEGMENTS[i],
      fraction = p.start / TRACK_LENGTH;
    if (
      p.y < 5 ||
      (fraction >= DESERT_MOUNTAIN.start - 0.02 && fraction <= DESERT_MOUNTAIN.end + 0.02)
    )
      continue;
    for (const side of [-1, 1]) {
      const x = p.x + p.nx * (p.halfWidth + 1) * side,
        z = p.z + p.nz * (p.halfWidth + 1) * side;
      // Check every deck: the nearest road can be the upper deck and hide the
      // crossing beneath it. Include the pillar footprint plus 1.5m of verge.
      const obstructsLowerRoad = SEGMENTS.some((s) => {
        const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / (s.len * s.len)));
        const y = s.y + s.dy * t;
        if (y > p.y - 3 || y < -7) return false;
        const halfWidth = s.halfWidth + (s.nextHalfWidth - s.halfWidth) * t;
        return (
          Math.hypot(x - s.x - s.dx * t, z - s.z - s.dz * t) < halfWidth + Math.SQRT2 * 0.7 + 1.5
        );
      });
      if (obstructsLowerRoad) continue;
      const pylon = w.box(x, p.y / 2 - 2, z, 1.4, p.y + 4, 1.4, 0x815942);
      pylon.userData.sceneryKind = 'desert-pylon';
      pylons.push(pylon);
    }
  }
  return pylons;
}
