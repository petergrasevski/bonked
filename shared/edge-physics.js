// Lightweight rigid-body contacts for the four tyres and the tumbling chassis.
// Coordinates match the rendered YXZ chassis; mass is normalized to one.
export const WHEEL_POINTS = [
  [-1.48, -0.91],
  [-1.48, 0.91],
  [1.43, -0.91],
  [1.43, 0.91],
];
export function bodyOffset(car, x, y, z) {
  const cp = Math.cos(car.pitch || 0),
    sp = Math.sin(car.pitch || 0),
    cr = Math.cos(car.roll || 0),
    sr = Math.sin(car.roll || 0),
    ca = Math.cos(car.angle),
    sa = Math.sin(car.angle);
  const px = x * cp - y * sp,
    py = (x * sp + y * cp) * cr - z * sr,
    pz = (x * sp + y * cp) * sr + z * cr;
  return { x: px * ca - pz * sa, y: py + (1 - cr * cp) * 0.5, z: px * sa + pz * ca };
}
export function wheelSupports(car, roadAt) {
  return WHEEL_POINTS.map(([x, z]) => {
    const p = bodyOffset(car, x, 0, z),
      surface = roadAt(car.x + p.x, car.z + p.z, car.y + p.y + 0.48);
    return surface && Math.abs(car.y + p.y - surface.y) < 0.48 ? { x, z, p, surface } : null;
  }).filter(Boolean);
}
export function balanceOnWheels(car, support, dt) {
  if (!support.length) return;
  const x = support.reduce((s, w) => s + w.x, 0) / support.length,
    z = support.reduce((s, w) => s + w.z, 0) / support.length;
  const old = bodyOffset(car, x, 0, z),
    inertiaRoll = 1.5,
    inertiaPitch = 3.5;
  // Gravity acts at the COM above the support line, tipping toward lost tyres.
  car.rollVelocity =
    ((car.rollVelocity || 0) - ((z * 22) / inertiaRoll) * dt) * Math.exp(-2.8 * dt);
  car.pitchVelocity =
    ((car.pitchVelocity || 0) + ((x * 22) / inertiaPitch) * dt) * Math.exp(-2.8 * dt);
  car.roll += car.rollVelocity * dt;
  car.pitch += car.pitchVelocity * dt;
  const next = bodyOffset(car, x, 0, z);
  car.x += old.x - next.x;
  car.z += old.z - next.z;
  const oldY = car.y;
  car.y = Math.max(...support.map((w) => w.surface.y - bodyOffset(car, w.x, 0, w.z).y));
  car.edgeVy = (car.y - oldY) / dt;
}
const HULL = [
  ...WHEEL_POINTS.map(([x, z]) => [x, 0, z]),
  ...[-2.2, 2.2].flatMap((x) =>
    [-0.95, 0.95].flatMap((z) => [
      [x, 0.25, z],
      [x, 1.05, z],
    ]),
  ),
];
export function collideTerrain(car, sample, dt) {
  let touched = false,
    maxImpact = 0;
  // Position correction followed by contact impulse keeps even a rolled roof
  // above terrain. Two passes handle multiple simultaneous chassis contacts.
  for (let pass = 0; pass < 2; pass++) {
    let best = null;
    for (const [x, y, z] of HULL) {
      const p = bodyOffset(car, x, y, z),
        s = sample(car.x + p.x, car.z + p.z, car.y + 3);
      if (!s) continue;
      const depth = s.y - (car.y + p.y);
      if (depth > 0 && (!best || depth > best.depth)) best = { p, s, depth };
    }
    if (!best) break;
    touched = true;
    const { p, s, depth } = best;
    car.y += depth + 0.005;
    car.groundY = s.y;
    const c = Math.cos(car.angle),
      sn = Math.sin(car.angle),
      px = p.x * c + p.z * sn,
      pz = -p.x * sn + p.z * c,
      py = p.y - 0.5,
      nf = s.nx * c + s.nz * sn,
      ns = -s.nx * sn + s.nz * c;
    const rollLever = py * ns - pz * s.ny,
      pitchLever = px * s.ny - py * nf;
    const speed =
      car.vx * s.nx +
      car.vy * s.ny +
      car.vz * s.nz +
      car.rollVelocity * rollLever +
      car.pitchVelocity * pitchLever;
    if (speed < 0) {
      const impulse =
        (-speed * 1.12) / (1 + (rollLever * rollLever) / 1.5 + (pitchLever * pitchLever) / 3.5);
      car.vx += impulse * s.nx;
      car.vy += impulse * s.ny;
      car.vz += impulse * s.nz;
      car.rollVelocity += (impulse * rollLever) / 1.5;
      car.pitchVelocity += (impulse * pitchLever) / 3.5;
      maxImpact = Math.max(maxImpact, -speed);
    }
  }
  if (touched) {
    const friction = Math.exp(-1.1 * dt);
    car.vx *= friction;
    car.vz *= friction;
    car.rollVelocity *= Math.exp(-2 * dt);
    car.pitchVelocity *= Math.exp(-2 * dt);
    car.impactTime = Math.max(car.impactTime, 0.25);
  }
  return { touched, maxImpact };
}
