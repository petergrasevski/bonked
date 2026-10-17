import { ARENA_SOLIDS, ARENA_SIZE } from './arena.js';
import {
  CAR_LENGTH,
  CAR_WIDTH,
  SEGMENTS,
  TRACK_LENGTH,
  activeTrack,
  hasBarrier,
  iceSplit,
  clamp,
} from './game.js';
export const MUZZLE_HEIGHT = 0.9;
export function weaponBasis(car) {
  const ca = Math.cos(car.angle),
    sa = Math.sin(car.angle),
    cp = Math.cos(car.pitch || 0),
    sp = Math.sin(car.pitch || 0),
    cr = Math.cos(car.roll || 0),
    sr = Math.sin(car.roll || 0);
  return {
    forward: { x: ca * cp - sa * sr * sp, y: cr * sp, z: sa * cp + ca * sr * sp },
    up: { x: -ca * sp - sa * sr * cp, y: cr * cp, z: -sa * sp + ca * sr * cp },
    side: { x: -sa * cr, y: -sr, z: ca * cr },
  };
}
export function bodyOrigin(car) {
  return {
    x: car.x,
    y: (car.y || 0) + (1 - Math.cos(car.roll || 0) * Math.cos(car.pitch || 0)) * 0.5,
    z: car.z,
  };
}
export function weaponDirection(car, offset = 0) {
  const b = weaponBasis(car),
    c = Math.cos(offset),
    s = Math.sin(offset);
  return {
    x: b.forward.x * c + b.side.x * s,
    y: b.forward.y * c + b.side.y * s,
    z: b.forward.z * c + b.side.z * s,
  };
}
export function weaponMuzzle(car, offset = 0, advance = CAR_LENGTH / 2 + 0.5) {
  const o = bodyOrigin(car),
    b = weaponBasis(car),
    d = weaponDirection(car, offset);
  return {
    x: o.x + b.up.x * MUZZLE_HEIGHT + d.x * advance,
    y: o.y + b.up.y * MUZZLE_HEIGHT + d.y * advance,
    z: o.z + b.up.z * MUZZLE_HEIGHT + d.z * advance,
  };
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function slab(interval, o, d, low, high) {
  if (Math.abs(d) < 1e-9) return o >= low && o <= high;
  let a = (low - o) / d,
    b = (high - o) / d;
  if (a > b) [a, b] = [b, a];
  interval[0] = Math.max(interval[0], a);
  interval[1] = Math.min(interval[1], b);
  return interval[0] <= interval[1];
}
// Full 3D swept chassis box. A ray passing a bridge's X/Z crossing only hits
// when its vertical interval overlaps the car on that particular deck.
export function rayCar3D(origin, delta, car, padding = 0) {
  const b = weaponBasis(car),
    center = bodyOrigin(car),
    o = { x: origin.x - center.x, y: origin.y - center.y, z: origin.z - center.z },
    interval = [0, 1];
  for (const [axis, lo, hi] of [
    [b.forward, -CAR_LENGTH / 2 - padding, CAR_LENGTH / 2 + padding],
    [b.up, -padding, 1.4 + padding],
    [b.side, -CAR_WIDTH / 2 - padding, CAR_WIDTH / 2 + padding],
  ])
    if (!slab(interval, dot(o, axis), dot(delta, axis), lo, hi)) return null;
  return interval[0];
}
let wallTrack = null,
  walls = [];
function trackWalls() {
  if (wallTrack === activeTrack.id) return walls;
  wallTrack = activeTrack.id;
  walls = [];
  for (let i = 0; i < SEGMENTS.length; i++) {
    const a = SEGMENTS[i],
      b = SEGMENTS[(i + 1) % SEGMENTS.length],
      fraction = (a.start + a.len * 0.5) / TRACK_LENGTH;
    for (const side of [-1, 1])
      for (const inner of [false, true]) {
        if (!hasBarrier(fraction, side, inner)) continue;
        const wa = inner ? iceSplit(a.x) : a.halfWidth + 0.28,
          wb = inner ? iceSplit(b.x) : b.halfWidth + 0.28;
        const x = a.x + a.nx * wa * side,
          z = a.z + a.nz * wa * side,
          ex = b.x + b.nx * wb * side,
          ez = b.z + b.nz * wb * side,
          dx = ex - x,
          dz = ez - z,
          len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        walls.push({
          x,
          z,
          y: a.y,
          dx: dx / len,
          dz: dz / len,
          len,
          grade: (b.y - a.y) / len,
          width: inner ? 0.225 : 0.28,
          minX: Math.min(x, ex),
          maxX: Math.max(x, ex),
          minZ: Math.min(z, ez),
          maxZ: Math.max(z, ez),
        });
      }
  }
  return walls;
}
export function sweepTrackWalls(origin, delta, radius = 0.25) {
  let first = null;
  if (activeTrack.id === 'cafe') {
    const edge = ARENA_SIZE / 2;
    const solids = [
      ...ARENA_SOLIDS,
      { x: -edge, z: 0, w: 1, d: ARENA_SIZE, h: 20 },
      { x: edge, z: 0, w: 1, d: ARENA_SIZE, h: 20 },
      { x: 0, z: -edge, w: ARENA_SIZE, d: 1, h: 20 },
      { x: 0, z: edge, w: ARENA_SIZE, d: 1, h: 20 },
    ];
    for (const p of solids) {
      const interval = [0, first ?? 1];
      if (
        slab(interval, origin.x, delta.x, p.x - p.w / 2 - radius, p.x + p.w / 2 + radius) &&
        slab(interval, origin.z, delta.z, p.z - p.d / 2 - radius, p.z + p.d / 2 + radius) &&
        slab(interval, origin.y, delta.y, -radius, p.h + radius)
      )
        first = interval[0];
    }
    return first;
  }
  for (const w of trackWalls()) {
    const extent = w.width + radius;
    if (
      Math.max(origin.x, origin.x + delta.x) < w.minX - extent ||
      Math.min(origin.x, origin.x + delta.x) > w.maxX + extent ||
      Math.max(origin.z, origin.z + delta.z) < w.minZ - extent ||
      Math.min(origin.z, origin.z + delta.z) > w.maxZ + extent
    )
      continue;
    const ox = origin.x - w.x,
      oz = origin.z - w.z,
      along = ox * w.dx + oz * w.dz,
      alongD = delta.x * w.dx + delta.z * w.dz,
      across = -ox * w.dz + oz * w.dx,
      acrossD = -delta.x * w.dz + delta.z * w.dx,
      interval = [0, first ?? 1];
    if (
      !slab(interval, along, alongD, -radius, w.len + radius) ||
      !slab(interval, across, acrossD, -extent, extent) ||
      !slab(
        interval,
        origin.y - w.y - along * w.grade,
        delta.y - alongD * w.grade,
        -0.18 - radius,
        1.45 + radius,
      )
    )
      continue;
    first = clamp(interval[0], 0, 1);
  }
  return first;
}

// Three physical roof barrels per side. +X points forward and ±Z outwards.
export function shotgunRays(car) {
  const b = weaponBasis(car),
    o = bodyOrigin(car),
    rays = [];
  for (const side of [-1, 1])
    for (const barrel of [-1, 0, 1]) {
      const forward = barrel * 0.25,
        lateral = side * 1.03,
        height = 1.39,
        direction = weaponDirection(car, side * (Math.PI / 2 - barrel * 0.09));
      const origin = {
        x: o.x + b.forward.x * forward + b.side.x * lateral + b.up.x * height,
        y: o.y + b.forward.y * forward + b.side.y * lateral + b.up.y * height,
        z: o.z + b.forward.z * forward + b.side.z * lateral + b.up.z * height,
      };
      rays.push({ origin, direction, side, barrel });
    }
  return rays;
}
