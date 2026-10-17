export const DEPLOY_PAUSE_MS = 10 * 60 * 1000;
export function roomOccupancy(rooms, now, graceMs) {
  let occupiedRooms = 0,
    players = 0;
  for (const room of rooms.values()) {
    const humans = [...room.players.values()].filter(
      (p) =>
        !p.bot &&
        (p.ws?.readyState === 1 || p.disconnectedAt == null || now - p.disconnectedAt <= graceMs),
    );
    if (humans.length) {
      occupiedRooms++;
      players += humans.length;
    }
  }
  return { occupiedRooms, players };
}
export class DeploymentGate {
  constructor({ rooms, graceMs, now = Date.now }) {
    this.rooms = rooms;
    this.graceMs = graceMs;
    this.now = now;
    this.lease = null;
  }
  status() {
    const now = this.now();
    if (this.lease && now >= this.lease.expiresAt) this.lease = null;
    return {
      ...roomOccupancy(this.rooms, now, this.graceMs),
      paused: !!this.lease,
      expiresAt: this.lease?.expiresAt ?? null,
    };
  }
  acquire(owner) {
    const status = this.status();
    if (status.players) return { status: 409, body: { ...status, reason: 'occupied' } };
    if (this.lease && this.lease.owner !== owner)
      return { status: 409, body: { ...status, reason: 'another-deployment' } };
    this.lease = { owner, expiresAt: this.now() + DEPLOY_PAUSE_MS };
    return { status: 200, body: this.status() };
  }
  release(owner) {
    this.status();
    if (this.lease?.owner === owner) this.lease = null;
    return this.status();
  }
}
