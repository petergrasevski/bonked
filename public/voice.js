export class PartyVoice {
  constructor(button) {
    this.button = button;
    this.muted = true;
    this.generation = 0;
    this.session = null;
    this.loading = null;
    button.onclick = () => this.toggle();
    document.addEventListener(
      'pointerdown',
      () => {
        if (this.context?.state === 'suspended')
          this.context
            .resume()
            .then(() => this.update())
            .catch(() => {});
      },
      { passive: true },
    );
    window.addEventListener('pagehide', () => this.leave());
    document.addEventListener('visibilitychange', () => {
      this.applyMute();
      if (!document.hidden) this.context?.resume().catch(() => {});
    });
  }
  prepare() {
    // Called from Create/Join's user gesture to satisfy mobile audio policy.
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (Context) this.context = new Context();
    }
    this.context?.resume().catch(() => {});
  }
  async join(session) {
    this.leave();
    this.session = session;
    this.button.hidden = false;
    this.prepare();
    this.connect();
    this.update();
    const generation = this.generation;
    // Receiving party chat never needs microphone permission.
    try {
      if (this.context?.audioWorklet) {
        await this.ensureNode();
        if (generation === this.generation) this.applyMute();
      }
    } catch {
      if (generation === this.generation) this.update();
    }
  }
  async ensureNode() {
    if (this.node) return;
    if (!this.loading)
      this.loading = (async () => {
        await this.context.audioWorklet.addModule('/voice-worklet.js');
        const node = new AudioWorkletNode(this.context, 'party-voice', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        node.port.onmessage = ({ data }) => {
          if (
            data.type === 'packet' &&
            !this.muted &&
            !document.hidden &&
            this.socket?.readyState === WebSocket.OPEN &&
            this.authenticated &&
            this.socket.bufferedAmount < 4096
          )
            this.socket.send(data.buffer);
        };
        node.connect(this.context.destination);
        this.node = node;
        // Read incoming playback energy only; no microphone access or recording for ducking.
        if (this.context.createAnalyser) {
          this.analyser = this.context.createAnalyser();
          this.analyser.fftSize = 256;
          this.analysis = new Float32Array(256);
          node.connect(this.analyser);
        }
      })().finally(() => {
        this.loading = null;
      });
    await this.loading;
  }
  activityLevel() {
    if (!this.analyser || !this.session || document.hidden || !this.authenticated) return 0;
    this.analyser.getFloatTimeDomainData(this.analysis);
    let sum = 0;
    for (const value of this.analysis) sum += value * value;
    return Math.sqrt(sum / this.analysis.length);
  }
  async enable() {
    if (this.requesting || !this.session) return;
    this.requesting = true;
    const generation = this.generation;
    if (!this.context?.audioWorklet || !navigator.mediaDevices?.getUserMedia) {
      this.requesting = false;
      this.update();
      return;
    }
    this.update();
    try {
      // Only the microphone button calls this permission request.
      await this.ensureNode();
      if (generation !== this.generation) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.source = this.context.createMediaStreamSource(stream);
      this.source.connect(this.node);
      for (const track of stream.getTracks())
        track.onended = () => {
          this.source?.disconnect();
          this.source = null;
          this.stream = null;
          this.muted = true;
          this.applyMute();
        };
      this.muted = false;
      this.applyMute();
    } catch {
      if (generation === this.generation) {
        this.muted = true;
        this.applyMute();
      }
    } finally {
      if (generation === this.generation) {
        this.requesting = false;
        this.update();
      }
    }
  }
  connect() {
    if (!this.session) return;
    const generation = this.generation,
      ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/voice`,
      );
    this.socket = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', ...this.session }));
    ws.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      if (typeof data === 'string') {
        const message = JSON.parse(data);
        if (message.type === 'ready') {
          this.authenticated = true;
          this.update();
        }
        return;
      }
      if (!this.node || data.byteLength !== 641 || document.hidden) return;
      const id = new Uint8Array(data, 0, 1)[0],
        pcm = data.slice(1);
      this.node.port.postMessage({ type: 'audio', id, pcm }, [pcm]);
    };
    ws.onclose = () => {
      if (generation !== this.generation) return;
      this.authenticated = false;
      this.update();
      this.retry = setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => {};
  }
  async toggle() {
    if (!this.session || this.requesting) return;
    this.prepare();
    if (!this.stream) {
      await this.enable();
      return;
    }
    this.muted = !this.muted;
    this.applyMute();
  }
  applyMute() {
    const muted = this.muted || document.hidden || !this.session || !this.stream;
    this.node?.port.postMessage({ type: 'mute', muted });
    for (const track of this.stream?.getTracks() || []) track.enabled = !muted;
    this.update();
  }
  update() {
    const live = !!this.stream && !this.muted && !document.hidden && !!this.session;
    this.button.setAttribute('aria-pressed', String(live));
    this.button.setAttribute('aria-label', live ? 'Mute microphone' : 'Enable microphone');
    this.button.title = live ? 'Mute microphone' : 'Enable microphone';
    this.button.disabled = !!this.requesting;
  }
  leave() {
    this.generation++;
    this.session = null;
    this.muted = true;
    this.requesting = false;
    clearTimeout(this.retry);
    this.authenticated = false;
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
    this.source?.disconnect();
    this.source = null;
    for (const track of this.stream?.getTracks() || []) {
      track.onended = null;
      track.stop();
    }
    this.stream = null;
    this.node?.port.postMessage({ type: 'mute', muted: true });
    this.node?.port.postMessage({ type: 'clear' });
    this.update();
    this.button.hidden = true;
  }
}
