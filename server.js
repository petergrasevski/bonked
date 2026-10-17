import { PLAYER_GRACE_MS } from './shared/session-limits.js';
import { LanSignaling } from './server-lan.js';
import { createRoomEngine } from './shared/room-engine.js';
import {
  TRACKS,
  selectTrack,
  getLandscape,
  MAX_PLAYERS,
  STEP,
  NEUTRAL,
  COLORS,
} from './shared/game.js';
import { ServerDiagnostics } from './server-diagnostics.js';
import { clientRevision, assetHeaders, matchesETag } from './server-assets.js';
import { PlayerActivity } from './server-activity.js';
import { DeploymentGate } from './server-deployment.js';
import { VoiceRelayBudget } from './server-voice.js';
import { skySurfaces } from './shared/sky-ground.js';
import { NETWORK_VERSION } from './shared/network-timing.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocketServer, WebSocket } from 'ws';
import QRCode from 'qrcode';
const root = path.dirname(fileURLToPath(import.meta.url));
const revision = await clientRevision(root);
const rooms = new Map(),
  connections = new Map();
const diagnostics = new ServerDiagnostics();
const PORT = Number(process.env.PORT) || 3210,
  HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = 100,
  GRACE_MS = PLAYER_GRACE_MS;
const deployment = new DeploymentGate({
  rooms: { values: () => [...rooms.values(), ...lan.rooms.values()] },
  graceMs: GRACE_MS,
});
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mid': 'audio/midi',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};
function lanURLs() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, entries]) =>
    entries
      .filter((n) => n.family === 'IPv4' && !n.internal && !name.startsWith('utun'))
      .map((n) => `http://${n.address}:${PORT}`),
  );
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/internal/lag-reports') {
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
        res.writeHead(403);
        return res.end();
      }
      if (req.method !== 'GET') {
        res.writeHead(405);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(diagnostics.incidents));
    }
    if (url.pathname === '/internal/deployment') {
      // CI accesses this through authenticated Fly SSH. Proxy/public requests
      // cannot impersonate loopback with forwarded headers.
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
        res.writeHead(403);
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'GET') return res.end(JSON.stringify(deployment.status()));
      if (req.method !== 'POST') {
        res.writeHead(405);
        return res.end();
      }
      const owner = req.headers['x-deployment-owner'];
      if (typeof owner !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(owner)) {
        res.writeHead(400);
        return res.end();
      }
      const action = url.searchParams.get('action');
      if (action === 'release') return res.end(JSON.stringify(deployment.release(owner)));
      if (action !== 'acquire') {
        res.writeHead(400);
        return res.end();
      }
      const result = deployment.acquire(owner);
      res.writeHead(result.status);
      return res.end(JSON.stringify(result.body));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      return res.end();
    }
    if (url.pathname === '/api/version') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ revision }));
    }
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          status: 'ok',
          version: NETWORK_VERSION,
          revision,
          rooms: rooms.size,
          uptime: Math.round(process.uptime()),
        }),
      );
    }
    if (url.pathname === '/api/config') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify({ lanURLs: process.env.PUBLIC_URL ? [process.env.PUBLIC_URL] : lanURLs() }),
      );
    }
    if (url.pathname === '/api/qr') {
      const value = url.searchParams.get('url');
      if (!value || value.length > 512 || !/^https?:\/\//.test(value)) {
        res.writeHead(400);
        return res.end();
      }
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(
        await QRCode.toString(value, {
          type: 'svg',
          margin: 1,
          color: { dark: '#101d26', light: '#ffffff' },
        }),
      );
    }
    const routes = {
      '/shared/volcano-boundary.js': 'shared/volcano-boundary.js',
      '/shared/factory-rotors.js': 'shared/factory-rotors.js',
      '/shared/volcano-terrain.js': 'shared/volcano-terrain.js',
      '/shared/extra-circuits.js': 'shared/extra-circuits.js',
      '/shared/coastal-barriers.js': 'shared/coastal-barriers.js',
      '/shared/rollover.js': 'shared/rollover.js',
      '/shared/beach-profile.js': 'shared/beach-profile.js',
      '/shared/sky-ground.js': 'shared/sky-ground.js',
      '/shared/sky-beam.js': 'shared/sky-beam.js',
      '/shared/shockwave.js': 'shared/shockwave.js',
      '/shared/coastal-crabs.js': 'shared/coastal-crabs.js',
      '/shared/desert-storm.js': 'shared/desert-storm.js',
      '/vendor/three.module.js': 'node_modules/three/build/three.module.js',
      '/vendor/three.core.js': 'node_modules/three/build/three.core.js',
      '/vendor/BufferGeometryUtils.js':
        'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js',
      '/vendor/RoundedBoxGeometry.js':
        'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js',
      '/shared/game.js': 'shared/game.js',
      '/shared/landscape.js': 'shared/landscape.js',
      '/shared/edge-physics.js': 'shared/edge-physics.js',
      '/shared/boost-pads.js': 'shared/boost-pads.js',
      '/shared/network-timing.js': 'shared/network-timing.js',
      '/shared/remote-snapshots.js': 'shared/remote-snapshots.js',
      '/shared/netcode.js': 'shared/netcode.js',
      '/shared/chase.js': 'shared/chase.js',
      '/shared/camera.js': 'shared/camera.js',
      '/shared/combat.js': 'shared/combat.js',
      '/shared/weapon-geometry.js': 'shared/weapon-geometry.js',
      '/shared/desert-features.js': 'shared/desert-features.js',
      '/shared/prediction.js': 'shared/prediction.js',
      '/shared/combat-prediction.js': 'shared/combat-prediction.js',
      '/shared/tournament.js': 'shared/tournament.js',
    };
    let filename = routes[url.pathname];
    if (!filename && /^\/shared\/[a-z][a-z0-9-]*\.js$/.test(url.pathname))
      filename = url.pathname.slice(1);
    if (!filename) {
      const requested =
        decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname).replace(
          /^\/+/,
          '',
        ) || 'index.html';
      filename = path.join('public', requested);
      if (!path.resolve(root, filename).startsWith(path.join(root, 'public') + path.sep)) {
        res.writeHead(403);
        return res.end();
      }
    }
    let data = await readFile(path.join(root, filename));
    if (['public/index.html', 'public/lan.html'].includes(filename))
      data = Buffer.from(
        data
          .toString()
          .replace('<head>', `<head>\n<meta name="bonked-revision" content="${revision}">`),
      );
    const caching = assetHeaders(filename, data);
    if (matchesETag(req.headers['if-none-match'], caching.ETag)) {
      res.writeHead(304, caching);
      return res.end();
    }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
      ...caching,
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'",
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 2048,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 1 }, concurrencyLimit: 4 },
});
// A dedicated bounded audio socket avoids TCP audio traffic queuing game inputs.
// Audio is relayed only to authenticated connected humans in the same room.
const lanWss = new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
const lan = new LanSignaling({ send, revision, codeAvailable: (code) => !rooms.has(code) });
lanWss.on('connection', (ws) => {
  let budget = 0,
    windowAt = Date.now();
  ws.lanAlive = true;
  ws.on('pong', () => (ws.lanAlive = true));
  ws.on('error', () => {});
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowAt > 1000) {
      windowAt = now;
      budget = 0;
    }
    if (++budget > 100) return ws.close(1008, 'Too many messages');
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if ((msg.type === 'lan-create' || msg.type === 'lan-join') && deployment.status().paused)
      return send(ws, { type: 'error', message: 'Updating Bonked. Try again shortly.' });
    lan.handle(ws, msg);
  });
  ws.on('close', () => lan.disconnect(ws));
});
const voiceWss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024,
  perMessageDeflate: false,
});
server.on('upgrade', (req, socket, head) => {
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        socket.destroy();
        return;
      }
    } catch {
      socket.destroy();
      return;
    }
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const target =
    pathname === '/ws'
      ? wss
      : pathname === '/voice'
        ? voiceWss
        : pathname === '/lan'
          ? lanWss
          : null;
  if (!target || target.clients.size >= 650) {
    socket.destroy();
    return;
  }
  target.handleUpgrade(req, socket, head, (ws) => target.emit('connection', ws, req));
});
voiceWss.on('connection', (ws) => {
  let room = null,
    player = null;
  const audioBudget = new VoiceRelayBudget(performance.now());
  ws.voiceAlive = true;
  ws.on('pong', () => (ws.voiceAlive = true));
  ws.on('error', () => {});
  const authTimeout = setTimeout(() => {
    if (!player) ws.close(1008, 'Join a lobby first');
  }, 5000);
  ws.on('message', (data, binary) => {
    if (!player) {
      if (binary) return ws.close(1008, 'Authentication required');
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return ws.close(1008, 'Invalid authentication');
      }
      room = rooms.get(String(msg.code || '').toUpperCase());
      player = [...(room?.players.values() || [])].find(
        (p) =>
          !p.bot &&
          p.ws?.readyState === WebSocket.OPEN &&
          typeof msg.token === 'string' &&
          p.token === msg.token,
      );
      if (!player) return ws.close(1008, 'Join a lobby first');
      clearTimeout(authTimeout);
      player.voice?.close(4001, 'Voice connected elsewhere');
      player.voice = ws;
      send(ws, { type: 'ready' });
      return;
    }
    if (!room.players.has(player.id) || !player.ws || player.voice !== ws)
      return ws.close(1008, 'Lobby ended');
    if (!binary || data.length !== 640) return ws.close(1008, 'Invalid audio frame');
    // Discard excess frames instead of disconnecting both sending and listening.
    // Refill continuously so an ordinary microphone resumes without a retry.
    if (!audioBudget.take(performance.now())) return;
    connections.get(player.ws)?.activity.voice(data, Date.now());
    const frame = Buffer.allocUnsafe(641);
    frame[0] = COLORS.indexOf(player.color);
    data.copy(frame, 1);
    for (const peer of room.players.values())
      if (
        peer !== player &&
        peer.ws &&
        peer.voice?.readyState === WebSocket.OPEN &&
        peer.voice.bufferedAmount < 8192
      )
        peer.voice.send(frame);
  });
  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (player?.voice === ws) player.voice = null;
  });
});
function send(ws, data) {
  if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 128 * 1024)
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
  else if (ws?.readyState === WebSocket.OPEN) diagnostics.backpressure++;
}
function fail(ws, message, requestId) {
  send(ws, {
    type: 'error',
    message,
    ...(typeof requestId === 'string' ? { requestId: requestId.slice(0, 80) } : {}),
  });
}
function roomCode() {
  let code;
  do {
    code = Array.from(randomBytes(3), (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[b % 26]).join('');
  } while (rooms.has(code) || lan.rooms.has(code));
  return code;
}
function broadcast(room, data) {
  const encoded = JSON.stringify(data);
  diagnostics.snapshotBytes +=
    Buffer.byteLength(encoded) * [...room.players.values()].filter((p) => p.ws).length;
  diagnostics.snapshots++;
  for (const p of room.players.values()) send(p.ws, encoded);
}
const engine = createRoomEngine({
  send,
  broadcast,
  onEmpty: (room) => rooms.delete(room.code),
  stats: diagnostics,
  randomUUID,
  randomBytes,
});
const { publish, resetRoom, addPlayer, removePlayer } = engine;
wss.on('connection', (ws, req) => {
  // Browsers must connect from the same origin; non-browser test clients have no Origin.
  if (req.headers.origin) {
    try {
      if (new URL(req.headers.origin).host !== req.headers.host) {
        ws.close(1008, 'Origin rejected');
        return;
      }
    } catch {
      ws.close(1008);
      return;
    }
  }
  if (wss.clients.size > 650) {
    ws.close(1013, 'Server full');
    return;
  }
  const client = {
    diagnosticId: randomBytes(3).toString('hex'),
    ws,
    room: null,
    player: null,
    alive: true,
    activity: new PlayerActivity(Date.now()),
    budget: 0,
    window: Date.now(),
  };
  connections.set(ws, client);
  ws.on('error', () => {});
  ws.on('pong', () => {
    client.alive = true;
    if (client.pingAt) diagnostics.ping.add(performance.now() - client.pingAt);
  });
  ws.on('message', (data) => {
    const now = Date.now();
    if (now - client.window > 1000) {
      client.window = now;
      client.budget = 0;
    }
    if (++client.budget > 150) {
      ws.close(1008, 'Too many messages');
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return fail(ws, 'Invalid message.');
    }
    if (!msg || typeof msg !== 'object') return;
    client.activity.message(msg.type, now);
    if (msg.type === 'activity') return;
    if (msg.type === 'ping')
      return send(ws, { type: 'pong', sent: msg.sent, time: now, diagnostics: diagnostics.last });
    if (msg.type === 'server-pong') {
      if (msg.id === client.appPingId && client.appPingAt) {
        client.applicationRttMs = performance.now() - client.appPingAt;
        diagnostics.applicationPing.add(client.applicationRttMs);
        client.appPingAt = null;
      }
      return;
    }
    if (msg.type === 'lag-report') {
      const capture = diagnostics.incident(client, msg.id, revision, now);
      if (capture) send(ws, { type: 'lag-report', id: msg.id, capture });
      return;
    }
    if (msg.type === 'net-report') {
      diagnostics.client(client, msg.metrics, now);
      return;
    }
    if (msg.type === 'create' || msg.type === 'join') {
      if (client.room) return fail(ws, 'Already in a room.');
      if (deployment.status().paused) {
        send(ws, {
          type: 'error',
          reason: 'updating',
          retryAfterMs: 2000,
          message: 'Updating Bonked—please wait…',
        });
        return;
      }
      if (msg.type === 'join' && lan.rooms.has(String(msg.code || '').toUpperCase()))
        return send(ws, { type: 'lan-redirect', code: String(msg.code).toUpperCase() });
      let room;
      if (msg.type === 'create') {
        if (rooms.size >= MAX_ROOMS) return fail(ws, 'The server is full. Try again shortly.');
        room = {
          trackId: Object.hasOwn(TRACKS, msg.trackId) ? msg.trackId : 'coast',
          code: roomCode(),
          players: new Map(),
          host: null,
          createdAt: now,
        };
        resetRoom(room, { newTournament: true });
        rooms.set(room.code, room);
      } else room = rooms.get(String(msg.code || '').toUpperCase());
      if (!room) return fail(ws, 'Room not found. Check the three-letter code.');
      let player = [...room.players.values()].find(
        (p) => !p.bot && typeof msg.token === 'string' && p.token === msg.token,
      );
      if (player) {
        const old = player.ws;
        player.ws = ws;
        player.disconnectedAt = null;
        player.lastInput = now;
        player.input = { ...NEUTRAL };
        if (old && old !== ws) old.close(4001, 'Connected elsewhere');
      } else {
        if (room.phase !== 'lobby')
          return fail(ws, 'This race has started. Join after it finishes.');
        if (room.players.size >= MAX_PLAYERS)
          return fail(ws, 'This room already has eight drivers.');
        player = addPlayer(room, ws, msg.name);
      }
      client.room = room;
      client.player = player;
      send(ws, {
        type: 'welcome',
        id: player.id,
        token: player.token,
        code: room.code,
        seq: player.seq,
      });
      publish(room);
      return;
    }
    const room = client.room,
      p = client.player;
    if (!room || !p || p.ws !== ws) return;
    selectTrack(room.trackId);
    if (msg.type === 'leave') {
      client.room = null;
      client.player = null;
    }
    engine.command(room, p, msg, now, ws);
  });
  ws.on('close', () => {
    connections.delete(ws);
    const { room, player: p } = client;
    if (!room || !p || p.ws !== ws) return;
    selectTrack(room.trackId);
    p.ws = null;
    p.input = { ...NEUTRAL };
    p.disconnectedAt = Date.now();
    if (room.host === p.id) room.host = [...room.players.values()].find((p) => p.ws)?.id || p.id;
    publish(room);
  });
});
let previous = performance.now(),
  accumulator = 0,
  tick = 0;
const timer = setInterval(() => {
  const current = performance.now();
  const elapsed = (current - previous) / 1000;
  diagnostics.droppedMs += Math.max(0, elapsed - 0.25) * 1000;
  accumulator += Math.min(elapsed, 0.25);
  previous = current;
  const publishRooms = new Set();
  while (accumulator >= STEP) {
    const tickStart = performance.now();
    accumulator -= STEP;
    tick++;
    diagnostics.ticks++;
    const now = Date.now();
    for (const room of rooms.values()) {
      selectTrack(room.trackId);
      for (const p of room.players.values())
        if (!p.bot && !p.ws && now - p.disconnectedAt > GRACE_MS) removePlayer(room, p);
      if (!rooms.has(room.code)) continue;
      engine.step(room, now);
      if (tick % 3 === 0) publishRooms.add(room);
    }
    diagnostics.tickCost.add(performance.now() - tickStart);
  }
  // Catch-up ticks produce one current snapshot, not a burst of stale ones.
  for (const room of publishRooms) if (rooms.has(room.code)) publish(room);
}, 8);
const diagnosticTimer = setInterval(() => diagnostics.report(rooms, connections), 1000);
const heartbeat = setInterval(() => {
  lan.sweep();
  for (const ws of lanWss.clients) {
    if (!ws.lanAlive) {
      ws.terminate();
      continue;
    }
    ws.lanAlive = false;
    ws.ping();
  }
  for (const ws of voiceWss.clients) {
    if (!ws.voiceAlive) {
      ws.terminate();
      continue;
    }
    ws.voiceAlive = false;
    ws.ping();
  }
  for (const c of connections.values()) {
    if (c.activity.expired(Date.now())) {
      const { room, player } = c;
      if (room && player) {
        c.room = null;
        c.player = null;
        removePlayer(room, player);
      }
      c.ws.close(4000, 'Inactive for ten minutes');
      continue;
    }
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.pingAt = performance.now();
    c.ws.ping();
    c.appPingAt = performance.now();
    c.appPingId = randomBytes(8).toString('hex');
    send(c.ws, { type: 'server-ping', id: c.appPingId });
  }
}, 10000);
wss.on('error', (error) => {
  console.error(`Cannot start game server on ${HOST}:${PORT}: ${error.code || error.message}`);
  clearInterval(timer);
  clearInterval(heartbeat);
  process.exit(1);
});
// Prebuild contact meshes before accepting players, never on the first fall.
for (const id of Object.keys(TRACKS)) {
  selectTrack(id);
  getLandscape();
  skySurfaces();
}
selectTrack('coast');
server.listen(PORT, HOST, () =>
  console.log(
    `\nBONKED\nLocal: http://localhost:${PORT}\n${lanURLs()
      .map((url) => `Wi-Fi: ${url}`)
      .join('\n')}\n`,
  ),
);
function shutdown() {
  for (const ws of lanWss.clients) ws.close(1001, 'Server restarting');
  lanWss.close();
  clearInterval(diagnosticTimer);
  diagnostics.close();
  for (const ws of voiceWss.clients) ws.close(1001, 'Server restarting');
  voiceWss.close();
  clearInterval(timer);
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'Server restarting');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
