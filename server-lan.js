import { randomBytes, randomUUID } from 'node:crypto';
import { MAX_PLAYERS, PLAYER_GRACE_MS } from './shared/session-limits.js';

// Signaling only. No controls or authoritative game state cross this service.
export class LanSignaling {
  constructor({
    send,
    revision,
    codeAvailable = () => true,
    now = Date.now,
    graceMs = PLAYER_GRACE_MS,
    maxRooms = 100,
  }) {
    Object.assign(this, { send, revision, codeAvailable, now, graceMs, maxRooms });
    this.rooms = new Map();
    this.clients = new Map();
  }
  fail(ws, message) {
    this.send(ws, { type: 'error', message });
  }
  handle(ws, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') return this.send(ws, { type: 'pong', sent: msg.sent });
    const existing = this.clients.get(ws);
    if (msg.type === 'lan-create' || msg.type === 'lan-join') {
      if (existing) return this.fail(ws, 'Already in a party.');
      if (msg.revision !== this.revision)
        return this.fail(ws, 'Bonked was updated. Reload the laptop and phone before joining.');
      let room,
        peer,
        code = String(msg.code || '').toUpperCase();
      if (msg.type === 'lan-create') {
        room = this.rooms.get(code);
        if (msg.token) {
          if (!room || msg.token !== room.owner.token)
            return this.fail(ws, 'This host session expired. End the party and create a new one.');
          peer = room.owner;
        } else {
          if (this.rooms.size >= this.maxRooms)
            return this.fail(ws, 'Too many parties. Try again shortly.');
          do {
            code = Array.from(randomBytes(3), (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 26]).join('');
          } while (this.rooms.has(code) || !this.codeAvailable(code));
          peer = { id: randomUUID(), token: randomBytes(24).toString('hex'), host: true };
          room = { code, owner: peer, players: new Map([[peer.id, peer]]) };
          this.rooms.set(code, room);
        }
      } else {
        room = this.rooms.get(code);
        if (!room) return this.fail(ws, 'LAN party not found. Check the room code.');
        peer = [...room.players.values()].find((p) => !p.host && p.token === msg.token);
        if (!peer) {
          if (room.players.size - 1 >= MAX_PLAYERS)
            return this.fail(ws, 'This party already has eight controllers.');
          peer = {
            id: randomUUID(),
            token: randomBytes(24).toString('hex'),
            name:
              String(msg.name || 'Driver')
                .trim()
                .slice(0, 18) || 'Driver',
            host: false,
          };
          room.players.set(peer.id, peer);
        }
      }
      const old = peer.ws;
      if (!peer.host) peer.generation = randomUUID();
      peer.ws = ws;
      peer.disconnectedAt = null;
      this.clients.set(ws, { room, peer });
      if (old && old !== ws) {
        this.clients.delete(old);
        old.close(4001, 'Connected elsewhere');
      }
      this.send(ws, {
        type: 'lan-welcome',
        code: room.code,
        id: peer.id,
        token: peer.token,
        host: peer.host,
      });
      if (peer.host) {
        for (const p of room.players.values())
          if (!p.host && p.ws)
            this.send(ws, { type: 'lan-peer', id: p.id, name: p.name, generation: p.generation });
      } else if (room.owner.ws)
        this.send(room.owner.ws, {
          type: 'lan-peer',
          id: peer.id,
          name: peer.name,
          generation: peer.generation,
        });
      return;
    }
    if (!existing) return this.fail(ws, 'Join a LAN party first.');
    const { room, peer } = existing;
    if (msg.type === 'lan-leave') {
      if (peer.host) this.end(room, 'The host ended this party.');
      else {
        room.players.delete(peer.id);
        this.clients.delete(ws);
        this.send(room.owner.ws, { type: 'lan-peer-left', id: peer.id });
        this.send(ws, { type: 'left' });
      }
      return;
    }
    if (msg.type !== 'lan-signal') return;
    const target = peer.host ? room.players.get(msg.to) : room.owner;
    if (
      !target ||
      target === peer ||
      (!peer.host && msg.to !== room.owner.id) ||
      target.host === peer.host
    )
      return;
    // Bounded SDP and ICE only; clients cannot use this as a game relay.
    const generation = peer.host ? target.generation : peer.generation;
    if (msg.generation !== generation) return;
    const signal = msg.signal;
    if (!signal || typeof signal !== 'object') return;
    let clean;
    if (signal.description) {
      const d = signal.description;
      if (
        d.type !== (peer.host ? 'offer' : 'answer') ||
        typeof d.sdp !== 'string' ||
        d.sdp.length > 12000
      )
        return;
      clean = { description: { type: d.type, sdp: d.sdp } };
    } else if (signal.candidate) {
      const c = signal.candidate;
      if (
        typeof c.candidate !== 'string' ||
        c.candidate.length > 2048 ||
        !/(?:^|\s)typ host(?:\s|$)/.test(c.candidate)
      )
        return;
      clean = {
        candidate: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid.slice(0, 32) : null,
          sdpMLineIndex:
            Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 16
              ? c.sdpMLineIndex
              : null,
        },
      };
    } else return;
    this.send(target.ws, { type: 'lan-signal', from: peer.id, generation, signal: clean });
  }
  disconnect(ws) {
    const client = this.clients.get(ws);
    this.clients.delete(ws);
    if (!client || client.peer.ws !== ws) return;
    client.peer.ws = null;
    client.peer.disconnectedAt = this.now();
  }
  sweep() {
    for (const room of this.rooms.values()) {
      if (!room.owner.ws && this.now() - room.owner.disconnectedAt > this.graceMs) {
        this.end(room, 'The host disconnected.');
        continue;
      }
      for (const p of room.players.values())
        if (!p.host && !p.ws && this.now() - p.disconnectedAt > this.graceMs) {
          room.players.delete(p.id);
          this.send(room.owner.ws, { type: 'lan-peer-left', id: p.id });
        }
    }
  }
  end(room, message) {
    this.rooms.delete(room.code);
    for (const p of room.players.values()) {
      this.send(p.ws, { type: 'lan-ended', message });
      if (p.ws) this.clients.delete(p.ws);
    }
  }
}
