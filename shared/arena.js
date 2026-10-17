// Cat Café geometry is shared by authoritative physics, prediction and rendering.
export const ARENA_SIZE = 160;
export const ARENA_PLATFORMS = [
  { x: -34, z: -25, w: 32, d: 30, h: 8, color: 0xa8c6b6 },
  { x: 34, z: 25, w: 32, d: 30, h: 8, color: 0xd6a5aa },
  { x: 0, z: 0, w: 24, d: 22, h: 16, color: 0xe2bc7f },
];
export const ARENA_RAMPS = [
  { x: -34, z: -52, w: 14, d: 24, base: 0, rise: 8, axis: 'z', sign: 1 },
  { x: 34, z: 52, w: 14, d: 24, base: 0, rise: 8, axis: 'z', sign: -1 },
  { x: 0, z: -27, w: 14, d: 32, base: 0, rise: 16, axis: 'z', sign: 1 },
];
export const ARENA_PROPS = [
  ...[
    [-58, -18],
    [56, 16],
    [-25, 40],
    [26, -40],
  ].map(([x, z], i) => ({
    x,
    z,
    w: 10,
    d: 10,
    h: 12,
    kind: 'coffee',
    color: [0xf6e4ca, 0x86b8ac, 0xe1a3ac, 0xe3bb70][i],
  })),
  ...[
    [-55, 35],
    [52, -35],
    [-15, -57],
    [15, 57],
  ].map(([x, z], i) => ({
    x,
    z,
    w: 15,
    d: 9,
    h: 7,
    kind: 'cat',
    color: [0xc28b58, 0x747784, 0xd9c6ac, 0x46434c][i],
  })),
  ...[
    [-55, 58],
    [55, -58],
    [-62, -55],
    [62, 55],
  ].map(([x, z]) => ({ x, z, w: 12, d: 12, h: 6, kind: 'block', color: 0xb9a0ca })),
];
export const ARENA_SOLIDS = [...ARENA_PLATFORMS, ...ARENA_PROPS];
export const ARENA_SPAWNS = Array.from({ length: 15 }, (_, i) => {
  const a = (i * Math.PI * 2) / 15;
  return { x: Math.cos(a) * 69, z: Math.sin(a) * 69, y: 0, nx: 0, nz: 1, angle: a + Math.PI };
});
export const ARENA_PICKUPS = [
  ...[
    [-65, -70],
    [-40, -70],
    [0, -68],
    [40, -70],
    [68, -5],
    [65, 68],
    [40, 70],
    [0, 69],
    [-40, 70],
    [-69, 0],
    [-15, 28],
    [15, -28],
  ].map(([x, z]) => ({ x, z, y: 0 })),
  ...ARENA_PLATFORMS.map((p) => ({ x: p.x, z: p.z, y: p.h })),
].map((p, i) => ({ ...p, row: i, lane: 0, fraction: i / 15 }));
export const inside = (p, x, z, margin = 0) =>
  Math.abs(x - p.x) <= p.w / 2 + margin && Math.abs(z - p.z) <= p.d / 2 + margin;
export function arenaSurface(x, z, ceiling = Infinity) {
  let y = 0,
    slope = 0;
  for (const p of ARENA_SOLIDS)
    if (inside(p, x, z) && p.h <= ceiling && p.h > y) {
      y = p.h;
      slope = 0;
    }
  for (const r of ARENA_RAMPS)
    if (inside(r, x, z)) {
      const h = r.base + r.rise * (0.5 + (r.sign * (z - r.z)) / r.d);
      if (h <= ceiling && h >= y) {
        y = h;
        slope = (r.sign * r.rise) / r.d;
      }
    }
  const ny = 1 / Math.hypot(1, slope);
  return { y, nx: 0, ny, nz: -slope * ny };
}
export function constrainArena(car) {
  const radius = 2.5;
  for (const axis of ['x', 'z']) {
    const limit = ARENA_SIZE / 2 - radius;
    if (Math.abs(car[axis]) > limit) {
      car[axis] = Math.sign(car[axis]) * limit;
      car['v' + axis] *= -0.2;
    }
  }
  for (const p of ARENA_SOLIDS) {
    const rampApproach = ARENA_RAMPS.some(
      (r) => inside(r, car.x, car.z) && r.base + r.rise === p.h && car.y >= p.h - 2.5,
    );
    if (rampApproach || car.y >= p.h - 0.55 || !inside(p, car.x, car.z, radius)) continue;
    const dx = car.x - p.x,
      dz = car.z - p.z,
      px = p.w / 2 + radius - Math.abs(dx),
      pz = p.d / 2 + radius - Math.abs(dz);
    const axis = px < pz ? 'x' : 'z',
      sign = Math.sign(axis === 'x' ? dx : dz) || 1;
    car[axis] += sign * (axis === 'x' ? px : pz);
    if (car['v' + axis] * sign < 0) car['v' + axis] *= -0.2;
  }
  const surface = arenaSurface(car.x, car.z, car.y + 0.65),
    old = car.groundY || 0;
  car.groundY = surface.y;
  car.falling = false;
  car.edgeBalance = false;
  if (surface.y >= old - 0.7 && car.y <= old + 0.01 && car.vy <= 0) car.y = surface.y;
  if (car.y < surface.y) {
    car.y = surface.y;
    car.vy = 0;
  }
  return {
    x: car.x,
    z: car.z,
    y: surface.y,
    grade: 0,
    fraction: car.trackFraction,
    distance: 0,
    halfWidth: 80,
    nx: 0,
    nz: 1,
    surface,
  };
}
// Triangles let the existing spectator ray caster target every raised surface.
export function arenaTriangles() {
  const out = [];
  const quad = (a, b, c, d) => out.push(...a, ...b, ...c, ...b, ...d, ...c);
  quad([-80, 0, -80], [80, 0, -80], [-80, 0, 80], [80, 0, 80]);
  for (const p of ARENA_SOLIDS)
    quad(
      [p.x - p.w / 2, p.h, p.z - p.d / 2],
      [p.x + p.w / 2, p.h, p.z - p.d / 2],
      [p.x - p.w / 2, p.h, p.z + p.d / 2],
      [p.x + p.w / 2, p.h, p.z + p.d / 2],
    );
  for (const r of ARENA_RAMPS) {
    const a = r.base + r.rise * (0.5 - r.sign / 2),
      b = r.base + r.rise * (0.5 + r.sign / 2);
    quad(
      [r.x - r.w / 2, a, r.z - r.d / 2],
      [r.x + r.w / 2, a, r.z - r.d / 2],
      [r.x - r.w / 2, b, r.z + r.d / 2],
      [r.x + r.w / 2, b, r.z + r.d / 2],
    );
  }
  return out;
}
export const arenaOverview = () => ({
  x: 0,
  y: 0,
  z: 0,
  angle: Math.PI / 2,
  pitch: Math.PI / 2 - 0.01,
  distance: 205,
  spread: 160,
  from: 0,
  to: 0,
  arenaOverview: true,
});
