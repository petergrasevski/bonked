// Host candidates only: no STUN, TURN, or cloud gameplay fallback.
export const LAN_RTC_CONFIG = { iceServers: [] };
export const LAN_CONNECTION_HELP =
  'Use the same main Wi-Fi network (not Guest). Allow local-network access, enable LAN access in your VPN, and keep the laptop awake. Guest/client isolation can block phones from reaching the laptop.';
export class LanPeer {
  constructor({
    initiator = false,
    signal,
    onMessage,
    onOpen = () => {},
    onClose = () => {},
    onStatus = () => {},
  }) {
    Object.assign(this, { signal, onMessage, onOpen, onClose, onStatus });
    this.closed = false;
    this.opened = false;
    this.candidates = [];
    this.chain = Promise.resolve();
    this.pc = new RTCPeerConnection(LAN_RTC_CONFIG);
    this.channels = new Map();
    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate?.type === 'host') signal({ candidate: candidate.toJSON() });
    };
    this.pc.ondatachannel = ({ channel }) => this.bind(channel);
    this.pc.onconnectionstatechange = () => {
      onStatus(this.pc.connectionState);
      if (['failed', 'closed'].includes(this.pc.connectionState)) this.close();
    };
    this.timeout = setTimeout(() => {
      if (!this.opened) {
        onStatus('timeout');
        this.close();
      }
    }, 20000);
    if (initiator) {
      this.bind(this.pc.createDataChannel('events'));
      this.bind(this.pc.createDataChannel('inputs', { ordered: false, maxRetransmits: 0 }));
      this.chain = this.pc
        .createOffer()
        .then((offer) => this.pc.setLocalDescription(offer))
        .then(() => signal({ description: this.pc.localDescription.toJSON() }))
        .catch(() => this.close());
    }
  }
  bind(channel) {
    if (!['events', 'inputs'].includes(channel.label) || this.channels.has(channel.label)) {
      channel.close();
      return;
    }
    this.channels.set(channel.label, channel);
    channel.onopen = () => {
      if (
        !this.opened &&
        this.channels.get('events')?.readyState === 'open' &&
        this.channels.get('inputs')?.readyState === 'open'
      ) {
        this.opened = true;
        clearTimeout(this.timeout);
        this.onOpen();
      }
    };
    channel.onclose = () => this.close();
    channel.onerror = () => this.close();
    channel.onmessage = (event) => {
      if (typeof event.data !== 'string' || event.data.length > 32768) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      if (channel.label === 'inputs' && message.type !== 'input') return;
      this.onMessage(message);
    };
  }
  receive(signal) {
    this.chain = this.chain
      .then(async () => {
        if (this.closed) return;
        if (signal.description) {
          await this.pc.setRemoteDescription(signal.description);
          for (const candidate of this.candidates) await this.pc.addIceCandidate(candidate);
          this.candidates = [];
          if (signal.description.type === 'offer') {
            await this.pc.setLocalDescription(await this.pc.createAnswer());
            this.signal({ description: this.pc.localDescription.toJSON() });
          }
        } else if (signal.candidate) {
          if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
          else this.candidates.push(signal.candidate);
        }
      })
      .catch(() => this.close());
  }
  send(message) {
    const channel = this.channels.get(message.type === 'input' ? 'inputs' : 'events');
    if (channel?.readyState !== 'open' || channel.bufferedAmount > 32768) return false;
    channel.send(JSON.stringify(message));
    return true;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timeout);
    this.pc.close();
    this.onClose();
  }
  async stats() {
    const reports = await this.pc.getStats();
    const pair = [...reports.values()].find(
      (r) => r.type === 'transport' && r.selectedCandidatePairId,
    );
    return pair ? reports.get(pair.selectedCandidatePairId) : null;
  }
}

export class LanSignalingClient {
  constructor({ onMessage, onStatus = () => {} }) {
    Object.assign(this, { onMessage, onStatus });
    this.closed = false;
    this.request = null;
    this.retry = 0;
    this.connect();
  }
  connect() {
    if (this.closed) return;
    const ws = (this.ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/lan`,
    ));
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('online');
      if (this.request) this.send(this.request);
    };
    ws.onmessage = ({ data }) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.type === 'lan-welcome')
        this.request = { ...this.request, code: msg.code, token: msg.token };
      this.onMessage(msg);
    };
    ws.onclose = (event) => {
      if (this.closed) return;
      if (event.code === 4001) {
        this.closed = true;
        this.onStatus('replaced');
        return;
      }
      this.onStatus('reconnecting');
      this.timer = setTimeout(() => this.connect(), Math.min(4000, 500 * 2 ** this.retry++));
    };
    ws.onerror = () => {};
  }
  start(request) {
    this.request = request;
    this.send(request);
  }
  send(message) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
  close(leave = true) {
    if (leave) this.send({ type: 'lan-leave' });
    this.closed = true;
    clearTimeout(this.timer);
    this.ws.close();
  }
}
