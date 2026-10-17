// Velocity-led movement in all three axes with soft authoritative corrections.
// Stale snapshots stop extrapolating, including climbing or diving shots.
export function projectilePose(previous, shot, snapshotTime, dt, now) {
  const pitch = shot.pitch || 0,
    cp = Math.cos(pitch),
    vx = shot.vx ?? Math.cos(shot.angle) * cp * shot.speed,
    vy = shot.vy ?? Math.sin(pitch) * shot.speed,
    vz = shot.vz ?? Math.sin(shot.angle) * cp * shot.speed,
    y = shot.y ?? 0.7;
  if (!previous)
    return {
      x: shot.x,
      y,
      z: shot.z,
      vx,
      vy,
      vz,
      angle: shot.angle,
      pitch,
      snapshotTime,
      receivedAt: now,
      anchorX: shot.x,
      anchorY: y,
      anchorZ: shot.z,
    };
  const p = { ...previous },
    fresh = p.snapshotTime !== snapshotTime,
    oldAge = (now - p.receivedAt) / 1000;
  if (oldAge < 0.15) {
    p.x += p.vx * dt;
    p.y += (p.vy || 0) * dt;
    p.z += p.vz * dt;
  }
  if (fresh) {
    p.snapshotTime = snapshotTime;
    p.receivedAt = now;
    p.anchorX = shot.x;
    p.anchorY = y;
    p.anchorZ = shot.z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
  }
  const age = Math.min(0.15, Math.max(0, (now - p.receivedAt) / 1000)),
    tx = p.anchorX + p.vx * age,
    ty = (p.anchorY ?? y) + (p.vy || 0) * age,
    tz = p.anchorZ + p.vz * age;
  const blend = 1 - Math.exp(-dt * 14),
    distance = Math.hypot(tx - p.x, ty - p.y, tz - p.z);
  if (distance > 18) {
    p.x = tx;
    p.y = ty;
    p.z = tz;
  } else {
    p.x += (tx - p.x) * blend;
    p.y += (ty - p.y) * blend;
    p.z += (tz - p.z) * blend;
  }
  p.angle += Math.atan2(Math.sin(shot.angle - p.angle), Math.cos(shot.angle - p.angle)) * blend;
  p.pitch = (p.pitch || 0) + (pitch - (p.pitch || 0)) * blend;
  return p;
}
