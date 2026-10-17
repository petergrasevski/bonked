import { LanPeer, LanSignalingClient, LAN_CONNECTION_HELP } from './lan-peer.js';

// WebSocket-shaped adapter lets the existing display/lobby use the same messages.
export class LanHostSocket extends EventTarget {
  constructor({ revision, onStatus = () => {}, onLocalMessage = () => {} }) {
    super();
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.peers = new Map();
    this.revision = revision;
    this.onStatus = onStatus;
    this.created = false;
    this.code = 'LOCAL';
    this.phoneCode = null;
    this.localPlayers = new Set();
    this.onLocalMessage = onLocalMessage;
    this.controls = new Map();
    this.skyAims = new Map();
    this.latestState = null;
    this.worker = new Worker(new URL('./lan-worker.js', import.meta.url), { type: 'module' });
    this.worker.onerror = () =>
      this.emit({
        type: 'error',
        message: 'Could not start the local game engine. Reload and try again.',
      });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        this.emit({ type: 'welcome', id: 'lan-display', code: this.code, mode: 'lan', seq: 0 });
        if (globalThis.RTCPeerConnection) this.enablePhones();
        else
          this.onStatus(
            'Phone controllers need WebRTC support. Laptop controllers can keep playing.',
          );
        return;
      }
      if (data.type === 'snapshot') {
        if (
          this.latestState?.round !== data.state.round ||
          this.latestState?.phase !== data.state.phase ||
          this.latestState?.trackId !== data.state.trackId
        ) {
          this.skyAims.clear();
          this.controls.clear();
        }
        this.latestState = data.state;
        this.emit(data.state);
        if (data.controllers !== false) {
          const s = data.state;
          const status = {
            type: 'state',
            code: s.code,
            trackId: s.trackId,
            phase: s.phase,
            time: s.time,
            startAt: s.startAt,
            round: s.round,
            tournamentComplete: s.tournamentComplete,
            tournamentWinnerId: s.tournamentWinnerId,
            roundResults: s.roundResults,
            targetScore: s.targetScore,
            nextRoundAt: s.nextRoundAt,
            camera: s.camera,
            players: s.players.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              health: p.health,
              item: p.item,
              ammo: p.ammo,
              shield: p.shield,
              score: p.score,
              ready: p.ready,
              eliminated: p.eliminated,
              finished: p.finished,
              wrecked: p.wrecked,
              overturned: p.overturned,
              nudgeCooldown: p.nudgeCooldown,
              skyTarget: p.skyTarget,
              skyCooldownUntil: p.skyCooldownUntil,
            })),
          };
          for (const { peer } of this.peers.values()) peer.send(status);
        }
      } else if (data.type === 'deliver') {
        if (data.id === 'lan-display') this.emit(data.message);
        else if (this.localPlayers.has(data.id)) this.onLocalMessage(data.id, data.message);
        else this.peers.get(data.id)?.peer.send(data.message);
      }
    };
  }
  enablePhones() {
    if (this.signaling) return;
    this.signaling = new LanSignalingClient({
      onMessage: (msg) => this.receive(msg),
      onStatus: (status) => {
        this.onStatus(
          status === 'online'
            ? 'Setup server connected'
            : status === 'replaced'
              ? 'Host opened in another tab'
              : 'Setup server reconnecting; connected controllers can keep playing',
        );
        if (status === 'replaced')
          this.onStatus('Phone sharing opened elsewhere; local controllers can keep playing');
      },
    });
    this.signaling.start({ type: 'lan-create', revision: this.revision });
    this.statsTimer = setInterval(() => {
      for (const [id, { peer }] of this.peers)
        if (peer.opened)
          peer
            .stats()
            .then((stats) =>
              this.onStatus(
                'Connected over local Wi-Fi',
                id,
                stats?.currentRoundTripTime != null
                  ? Math.round(stats.currentRoundTripTime * 1000)
                  : null,
              ),
            )
            .catch(() => {});
    }, 2000);
  }
  emit(message) {
    if (this.readyState === 1)
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }
  receive(msg) {
    if (msg.type === 'lan-welcome') {
      this.code = this.phoneCode = msg.code;
      this.worker.postMessage({ type: 'set-code', code: msg.code });
      this.emit({ type: 'phone-room', code: msg.code });
      return;
    }
    if (msg.type === 'error') {
      if (!this.phoneCode) {
        this.signaling?.close(false);
        this.signaling = null;
        clearInterval(this.statsTimer);
      }
      this.emit(msg);
      return;
    }
    if (msg.type === 'lan-ended') {
      for (const [id, { peer }] of this.peers) {
        peer.close();
        this.worker.postMessage({ type: 'peer-left', id });
      }
      this.peers.clear();
      this.phoneCode = null;
      this.code = 'LOCAL';
      this.signaling?.close(false);
      this.signaling = null;
      clearInterval(this.statsTimer);
      this.worker.postMessage({ type: 'set-code', code: this.code });
      this.emit({ type: 'phone-sharing-ended' });
      this.onStatus(msg.message + ' Local controllers can keep playing.');
      return;
    }
    if (msg.type === 'lan-peer') {
      const existing = this.peers.get(msg.id);
      if (existing?.generation === msg.generation) return;
      existing?.peer.close();
      const record = { name: msg.name, generation: msg.generation };
      record.peer = new LanPeer({
        initiator: true,
        signal: (signal) =>
          this.signaling.send({
            type: 'lan-signal',
            to: msg.id,
            generation: msg.generation,
            signal,
          }),
        onOpen: () => {
          if (this.peers.get(msg.id) !== record) return;
          this.worker.postMessage({ type: 'peer-open', id: msg.id, name: msg.name });
          this.onStatus('Connected over local Wi-Fi', msg.id);
        },
        onMessage: (message) => {
          if (this.peers.get(msg.id) !== record) return;
          if (!['input', 'item', 'ping', 'ready', 'leave'].includes(message.type)) return;
          this.command(msg.id, message);
        },
        onClose: () => {
          if (this.peers.get(msg.id) !== record) return;
          this.worker.postMessage({ type: 'peer-close', id: msg.id });
          this.onStatus('Disconnected · retry on phone', msg.id);
        },
        onStatus: (status) => {
          if (['timeout', 'failed'].includes(status))
            this.onStatus('Could not connect. ' + LAN_CONNECTION_HELP, msg.id);
        },
      });
      this.peers.set(msg.id, record);
      this.onStatus('Connecting…', msg.id);
      return;
    }
    if (msg.type === 'lan-peer-left') {
      const record = this.peers.get(msg.id);
      this.peers.delete(msg.id);
      record?.peer.close();
      this.worker.postMessage({ type: 'peer-left', id: msg.id });
      this.onStatus('Left party', msg.id);
      return;
    }
    if (msg.type === 'lan-signal') {
      const record = this.peers.get(msg.from);
      if (record?.generation === msg.generation) record.peer.receive(msg.signal);
    }
  }
  send(encoded) {
    const message = JSON.parse(encoded);
    if (message.type === 'create') {
      if (!this.created) {
        this.created = true;
        this.worker.postMessage({ type: 'create', code: this.code });
      }
      return;
    }
    if (message.type === 'leave') {
      this.close();
      return;
    }
    this.worker.postMessage({ type: 'command', id: 'lan-display', message });
  }
  addLocalPlayer({ id, name }) {
    this.localPlayers.add(id);
    this.worker.postMessage({ type: 'peer-open', id, name });
  }
  sendLocal(id, message) {
    if (this.localPlayers.has(id)) this.command(id, message);
  }
  command(id, message) {
    if (message.type === 'input') {
      const axis = (v) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
      this.controls.set(id, {
        x: axis(message.skyMove?.x),
        y: axis(message.skyMove?.y),
        at: performance.now(),
      });
      message = { ...message, skyAim: this.skyAims.get(id) || null };
    }
    this.worker.postMessage({ type: 'command', id, message });
  }
  skyControllers(now = performance.now()) {
    const result = new Map();
    if (this.latestState?.phase === 'racing')
      for (const p of this.latestState.players)
        if (p.eliminated && !p.bot && p.connected) {
          const input = this.controls.get(p.id);
          result.set(
            p.id,
            input && now - input.at < 1000 ? { x: input.x, y: input.y } : { x: 0, y: 0 },
          );
        }
    return result;
  }
  setSkyAims(aims) {
    const next = new Map(),
      changed = [];
    for (const [id, aim] of aims) {
      if (
        !this.latestState?.players.some(
          (p) => p.id === id && p.eliminated && !p.bot && p.connected,
        ) ||
        !Number.isFinite(aim.x) ||
        !Number.isFinite(aim.z)
      )
        continue;
      next.set(id, { x: aim.x, z: aim.z });
      const previous = this.skyAims.get(id);
      if (!previous || Math.hypot(aim.x - previous.x, aim.z - previous.z) > 0.0001)
        changed.push({ id, aim: { x: aim.x, z: aim.z } });
    }
    this.skyAims = next;
    if (changed.length) this.worker.postMessage({ type: 'sky-aims', aims: changed });
  }
  disconnectLocal(id) {
    if (this.localPlayers.has(id)) this.worker.postMessage({ type: 'peer-close', id });
  }
  removeLocal(id) {
    this.localPlayers.delete(id);
    this.controls.delete(id);
    this.skyAims.delete(id);
    this.worker.postMessage({ type: 'peer-left', id });
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearInterval(this.statsTimer);
    this.signaling?.close();
    for (const { peer } of this.peers.values()) peer.close();
    this.peers.clear();
    this.localPlayers.clear();
    this.controls.clear();
    this.skyAims.clear();
    this.worker.terminate();
    this.dispatchEvent(new Event('close'));
  }
}
