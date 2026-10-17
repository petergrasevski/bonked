import { FACTORY_TABLES, FACTORY_ROTOR_SPEED, circuitDistance } from './extra-circuits.js';
const TAU = Math.PI * 2;
export const ROTOR_SPEED = FACTORY_ROTOR_SPEED;
export const ROTOR_RINGS = [
  { radius: 17, gap: 1.08, offset: 0, layer: 0 },
  { radius: 8.5, gap: 1.35, offset: 1.05, layer: 1 },
];
export const rotorAngle = (seconds, index, layer = 0) =>
  seconds * ROTOR_SPEED * (index % 2 ? -1 : 1) * (layer ? -1.2 : 1);
export function rotorWallSegments(point, seconds, index) {
  const result = [];
  for (const ring of ROTOR_RINGS)
    for (let arc = 0; arc < 3; arc++) {
      const rotation = rotorAngle(seconds, index, ring.layer),
        omega = ROTOR_SPEED * (index % 2 ? -1 : 1) * (ring.layer ? -1.2 : 1);
      const start = rotation + ring.offset + (arc * TAU) / 3 + ring.gap / 2,
        end = rotation + ring.offset + ((arc + 1) * TAU) / 3 - ring.gap / 2,
        n = Math.ceil((end - start) / 0.12);
      for (let j = 0; j < n; j++) {
        const a = start + ((end - start) * j) / n,
          b = start + ((end - start) * (j + 1)) / n;
        const radius = (t) =>
          ring.radius +
          Math.sin((t - rotation) * 3.7 + index + ring.layer) * 0.85 +
          Math.sin((t - rotation) * 7) * 0.35;
        result.push({
          ax: point.x + Math.cos(a) * radius(a),
          az: point.z + Math.sin(a) * radius(a),
          bx: point.x + Math.cos(b) * radius(b),
          bz: point.z + Math.sin(b) * radius(b),
          radius: ring.radius,
          layer: ring.layer,
          omega,
        });
      }
      // Uneven tangential tails break the perfect concentric-ring silhouette.
      if (!ring.layer && arc !== 1) {
        const a = end,
          r =
            ring.radius +
            Math.sin((a - rotation) * 3.7 + index) * 0.85 +
            Math.sin((a - rotation) * 7) * 0.35,
          x = point.x + Math.cos(a) * r,
          z = point.z + Math.sin(a) * r;
        result.push({
          ax: x,
          az: z,
          bx: x - Math.cos(a) * 2.3,
          bz: z - Math.sin(a) * 2.3,
          radius: ring.radius,
          layer: 0,
          omega,
        });
      }
    }
  return result;
}
function closest(x, z, w) {
  const dx = w.bx - w.ax,
    dz = w.bz - w.az,
    t = Math.max(0, Math.min(1, ((x - w.ax) * dx + (z - w.az) * dz) / (dx * dx + dz * dz)));
  return { x: w.ax + dx * t, z: w.az + dz * t };
}
export function collideFactoryRotors(car, trackAt, seconds) {
  if (car.falling || car.eliminated || car.y - (car.groundY || 0) > 2.3) return;
  for (let index = 0; index < FACTORY_TABLES.length; index++) {
    const p = trackAt(FACTORY_TABLES[index]);
    if (Math.hypot(car.x - p.x, car.z - p.z) > 29) continue;
    const walls = rotorWallSegments(p, seconds, index),
      c = Math.cos(car.angle),
      s = Math.sin(car.angle);
    // Three disks approximate the car's long collision footprint. Short fixed
    // ticks and a 1.7m capsule radius prevent cars slipping through wall seams.
    for (let pass = 0; pass < 2; pass++)
      for (const along of [-1.65, 0, 1.65])
        for (const wall of walls) {
          const x = car.x + c * along,
            z = car.z + s * along,
            q = closest(x, z, wall),
            dx = x - q.x,
            dz = z - q.z,
            d = Math.hypot(dx, dz),
            limit = 1.65;
          if (d >= limit) continue;
          const nx =
              d > 1e-6
                ? dx / d
                : -(wall.bz - wall.az) / Math.hypot(wall.bx - wall.ax, wall.bz - wall.az),
            nz =
              d > 1e-6
                ? dz / d
                : (wall.bx - wall.ax) / Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
          car.x += nx * (limit - d);
          car.z += nz * (limit - d);
          const wx = -(q.z - p.z) * wall.omega,
            wz = (q.x - p.x) * wall.omega,
            normal = (car.vx - wx) * nx + (car.vz - wz) * nz;
          if (normal < 0) {
            car.vx -= nx * normal * 1.05;
            car.vz -= nz * normal * 1.05;
            car.impactTime = Math.max(car.impactTime || 0, 0.15);
          }
        }
  }
}
// Navigation is advisory bot state, held out of replicated car snapshots.
const routes = new WeakMap();
// A tangent approach and outer arc clear every phase of the rotating walls.
// Hard bots use 23 fixed waypoints instead of repeatedly searching the maze.
const outsideRoutes = new WeakMap();
function outerRotorTarget(car, p, index) {
  const fx = Math.cos(p.angle),
    fz = Math.sin(p.angle),
    nx = -fz,
    nz = fx;
  const x = (car.x - p.x) * fx + (car.z - p.z) * fz,
    z = (car.x - p.x) * nx + (car.z - p.z) * nz;
  let route = outsideRoutes.get(car);
  if (!route || route.index !== index) {
    const side = Math.abs(z) > 1 ? Math.sign(z) : car.gridSlot % 2 ? -1 : 1,
      r = 21.1,
      start = 45,
      theta = Math.acos(-r / start),
      points = [{ x: -start, z: 0 }];
    for (let i = 0; i <= 20; i++) {
      const a = theta + ((Math.PI - theta * 2) * i) / 20;
      points.push({ x: r * Math.cos(a), z: side * r * Math.sin(a) });
    }
    points.push({ x: start, z: 0 });
    route = { index, points };
    outsideRoutes.set(car, route);
  }
  let nearest = 0,
    best = Infinity,
    projection = 0;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i],
      b = route.points[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z,
      t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz))),
      d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d < best) {
      best = d;
      nearest = i;
      projection = t;
    }
  }
  let remaining = Math.max(4, Math.hypot(car.vx, car.vz) * 0.32),
    target = route.points.at(-1);
  for (let i = nearest; i < route.points.length - 1; i++) {
    const a = route.points[i],
      b = route.points[i + 1],
      t = i === nearest ? projection : 0,
      segment = Math.hypot(b.x - a.x, b.z - a.z),
      distance = segment * (1 - t);
    if (distance >= remaining) {
      const u = t + remaining / segment;
      target = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      break;
    }
    remaining -= distance;
  }
  return {
    point: { x: p.x + target.x * fx + target.z * nx, z: p.z + target.x * fz + target.z * nz },
  };
}
export function rotorBotTarget(car, trackAt, length, difficulty = 'medium') {
  const index = FACTORY_TABLES.findIndex((f) => circuitDistance(car.trackFraction, f, length) < 48);
  if (index < 0) return null;
  const p = trackAt(FACTORY_TABLES[index]),
    fx = Math.cos(p.angle),
    fz = Math.sin(p.angle),
    nx = -fz,
    nz = fx;
  const x = (car.x - p.x) * fx + (car.z - p.z) * fz,
    z = (car.x - p.x) * nx + (car.z - p.z) * nz;
  if (x > 28) return null;
  if (difficulty === 'hard') return outerRotorTarget(car, p, index);
  const time = car.raceTime || 0;
  let cached = routes.get(car);
  if (
    !cached ||
    cached.index !== index ||
    time - cached.at > 0.18 ||
    Math.hypot(car.x - cached.x, car.z - cached.z) > 6
  ) {
    const walls = rotorWallSegments(p, time + 0.3, index),
      step = 2,
      N = 31;
    const at = (ix, iz) => ({
      x: p.x + (ix * step - 30) * fx + (iz * step - 30) * nx,
      z: p.z + (ix * step - 30) * fz + (iz * step - 30) * nz,
    });
    const valid = new Map(),
      clear = (ix, iz) => {
        const key = iz * N + ix;
        if (valid.has(key)) return valid.get(key);
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) return false;
        const lx = ix * step - 30,
          lz = iz * step - 30,
          q = at(ix, iz);
        let ok = Math.abs(lz) < 7 || Math.hypot(lx, lz) < 19.5;
        if (ok)
          ok = !walls.some((w) => {
            const c = closest(q.x, q.z, w);
            return Math.hypot(q.x - c.x, q.z - c.z) < 2.8;
          });
        valid.set(key, ok);
        return ok;
      };
    const sx = Math.max(0, Math.min(N - 1, Math.round((x + 30) / step))),
      sz = Math.max(0, Math.min(N - 1, Math.round((z + 30) / step))),
      start = sz * N + sx,
      goal = 15 * N + 30;
    const queue = [start],
      parents = new Map([[start, null]]);
    let end = null;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const key = queue[cursor];
      if (key === goal) {
        end = key;
        break;
      }
      const ix = key % N,
        iz = Math.floor(key / N);
      for (const [dx, dz] of [
        [1, 0],
        [0, 1],
        [0, -1],
        [-1, 0],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        const xx = ix + dx,
          zz = iz + dz,
          k = zz * N + xx;
        if (parents.has(k) || !clear(xx, zz)) continue;
        if (dx && dz && (!clear(ix + dx, iz) || !clear(ix, iz + dz))) continue;
        parents.set(k, key);
        queue.push(k);
      }
    }
    const path = [];
    while (end !== null && end !== start) {
      path.push(at(end % N, Math.floor(end / N)));
      end = parents.get(end) ?? null;
    }
    path.reverse();
    cached = { index, at: time, x: car.x, z: car.z, path };
    routes.set(car, cached);
  }
  const target = cached.path.find((q) => Math.hypot(q.x - car.x, q.z - car.z) > 4);
  return {
    point: target ?? { x: car.x + fx * 3 - nx * z * 0.5, z: car.z + fz * 3 - nz * z * 0.5 },
  };
}
