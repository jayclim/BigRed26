// Browser side of the Gemini Live guide: token, camera frames, optional microphone, gapless audio playback.
// The browser holds only a short-lived, single-use ephemeral token. The long-lived key never leaves the server.
import type { Locale, Result } from '@contracts/contracts.ts';
import { captureFrame } from '@/features/guide/frameCapture.ts';
import {
  FRAME_INTERVAL_MS, INPUT_SAMPLE_RATE, OUTPUT_SAMPLE_RATE, START_TEXT, TICK_AFTER_SILENCE_MS, TICK_TEXT,
  audioEndMessage, audioMessage, base64ToBytes, bytesToBase64, createCaptions, floatToPcm16, liveUrl, parseServerMessage,
  pcm16ToFloat32, setupMessage, textMessage, videoMessage, type LiveEvent,
} from './liveProtocol.ts';

export interface LiveTokenInfo { token: string; endpoint: string; setup: unknown; routeName: string; locale: Locale }
export type LiveStatus = 'idle' | 'starting' | 'live' | 'reconnecting' | 'stopped' | 'error';
export type LiveFailure = 'unavailable' | 'camera_denied' | 'camera_missing' | 'camera_error' | 'token' | 'socket' | 'limit' | 'mic_denied' | 'mic_error';
export interface LiveHandlers {
  onStatus(status: LiveStatus): void;
  onFailure(kind: LiveFailure, detail?: string): void;
  onCaptions(lines: string[]): void;
  onSpeaking(speaking: boolean): void;
}
export interface LiveOptions { routeId: string; locale: Locale; video: HTMLVideoElement; handlers: LiveHandlers; fetchToken?: typeof fetchLiveToken }

const MAX_RECONNECTS = 3;
const MAX_BUFFERED = 1_000_000; // skip frames when the socket backs up

export async function fetchLiveToken(routeId: string, locale: Locale): Promise<Result<LiveTokenInfo>> {
  try {
    const res = await fetch('/api/live/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ routeId, locale }), cache: 'no-store' });
    return await res.json() as Result<LiveTokenInfo>;
  } catch { return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: "Can't reach the Breadcrumb server.", retryable: true } }; }
}
export async function liveGuideEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/live/token', { cache: 'no-store' });
    const json = await res.json() as Result<{ enabled: boolean }>;
    return res.ok && json.ok && json.value.enabled === true;
  } catch { return false; }
}

const MIC_WORKLET = `class Tap extends AudioWorkletProcessor { process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true; } }
registerProcessor('breadcrumb-mic-tap', Tap);`;

/** Plays 24 kHz PCM chunks back to back with no gaps. `clear()` drops queued audio (used when the user interrupts). */
export class PcmPlayer {
  private next = 0; private sources = new Set<AudioBufferSourceNode>();
  constructor(private ctx: AudioContext, private onIdle: () => void) {}
  push(bytes: Uint8Array) {
    const samples = pcm16ToFloat32(bytes); if (!samples.length) return;
    const buffer = this.ctx.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE); // the browser resamples to the device rate
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = this.ctx.createBufferSource(); source.buffer = buffer; source.connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.03, this.next);
    source.start(at); this.next = at + buffer.duration;
    this.sources.add(source);
    source.onended = () => { this.sources.delete(source); if (!this.sources.size) this.onIdle(); };
  }
  clear() {
    for (const s of this.sources) { s.onended = null; try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear(); this.next = 0; this.onIdle();
  }
  get playing() { return this.sources.size > 0; }
}

export class LiveGuideSession {
  private o: LiveOptions; private h: LiveHandlers;
  private ctx: AudioContext | null = null; private player: PcmPlayer | null = null;
  private camera: MediaStream | null = null; private mic: MediaStream | null = null; private micNode: AudioWorkletNode | null = null; private micSource: MediaStreamAudioSourceNode | null = null;
  private micOn = false; private micPending = new Uint8Array(0);
  private ws: WebSocket | null = null; private ready = false; private stopped = false; private reconnects = 0; private generation = 0;
  private frameTimer: ReturnType<typeof setInterval> | null = null; private capturing = false;
  private lastSpoke = 0; private connectedAt = 0; private announced = false; private tickTimer: ReturnType<typeof setInterval> | null = null; private generating = false;
  private captions = createCaptions(); private speaking = false;

  constructor(options: LiveOptions) { this.o = options; this.h = options.handlers; }

  /** Call from a click handler: the AudioContext must be created inside the user gesture. */
  async start() {
    this.stopped = false; this.reconnects = 0; this.announced = false;
    this.h.onStatus('starting');
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) { this.fail('unavailable'); return; }
    this.ctx = new Ctx(); void this.ctx.resume();
    this.player = new PcmPlayer(this.ctx, () => this.setSpeaking(false));
    if (!(await this.startCamera())) return;
    await this.connect();
  }

  stop() {
    this.stopped = true; this.generation++;
    this.teardownSocket(1000);
    this.stopMic(); this.camera?.getTracks().forEach((t) => t.stop()); this.camera = null;
    if (this.o.video.srcObject) this.o.video.srcObject = null;
    this.player?.clear(); this.player = null;
    void this.ctx?.close().catch(() => {}); this.ctx = null;
    this.captions.reset(); this.h.onCaptions([]); this.h.onStatus('stopped');
  }

  async setMic(on: boolean) {
    if (on === this.micOn) return;
    if (!on) { this.micOn = false; this.mic?.getAudioTracks().forEach((t) => { t.enabled = false; }); this.micPending = new Uint8Array(0); this.send(audioEndMessage()); return; }
    if (!this.ctx) return;
    try {
      if (!this.mic) {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no mic'), { name: 'NotFoundError' });
        this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        const url = URL.createObjectURL(new Blob([MIC_WORKLET], { type: 'application/javascript' }));
        try { await this.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
        this.micSource = this.ctx.createMediaStreamSource(this.mic);
        this.micNode = new AudioWorkletNode(this.ctx, 'breadcrumb-mic-tap');
        this.micNode.port.onmessage = (e: MessageEvent<Float32Array>) => this.onMicSamples(e.data);
        this.micSource.connect(this.micNode); // not connected to the speakers
      }
      this.mic.getAudioTracks().forEach((t) => { t.enabled = true; });
      this.micOn = true;
    } catch (e) {
      this.stopMic(); this.micOn = false;
      const name = (e as DOMException)?.name;
      this.h.onFailure(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic_denied' : 'mic_error');
    }
  }
  get micEnabled() { return this.micOn; }

  private onMicSamples(samples: Float32Array) {
    if (!this.micOn || !this.ready || !this.ctx) return;
    const chunk = floatToPcm16(samples, this.ctx.sampleRate);
    const merged = new Uint8Array(this.micPending.length + chunk.length); merged.set(this.micPending); merged.set(chunk, this.micPending.length);
    const size = INPUT_SAMPLE_RATE * 2 / 10; // 100 ms
    if (merged.length < size) { this.micPending = merged; return; }
    this.micPending = new Uint8Array(0);
    this.send(audioMessage(bytesToBase64(merged)));
  }
  private stopMic() {
    this.micNode?.disconnect(); this.micSource?.disconnect(); this.micNode = null; this.micSource = null;
    this.mic?.getTracks().forEach((t) => t.stop()); this.mic = null; this.micPending = new Uint8Array(0);
  }

  private async startCamera(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) { this.fail('camera_missing'); return false; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (this.stopped) { stream.getTracks().forEach((t) => t.stop()); return false; }
      this.camera = stream; this.o.video.srcObject = stream; await this.o.video.play().catch(() => {});
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      this.fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'camera_denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'camera_missing' : 'camera_error');
      return false;
    }
  }

  private async connect() {
    const gen = ++this.generation; this.ready = false;
    const minted = await (this.o.fetchToken ?? fetchLiveToken)(this.o.routeId, this.o.locale);
    if (this.stopped || gen !== this.generation) return;
    if (!minted.ok) { this.fail(minted.error.code === 'PROVIDER_UNAVAILABLE' && !minted.error.retryable ? 'unavailable' : 'token', minted.error.message); return; }
    const info = minted.value;
    let ws: WebSocket;
    try { ws = new WebSocket(liveUrl(info.endpoint, info.token)); } catch { this.fail('socket'); return; }
    this.ws = ws;
    ws.onopen = () => { if (gen === this.generation) ws.send(setupMessage(info.setup)); };
    ws.onmessage = async (event) => {
      if (gen !== this.generation) return;
      const raw = typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
      if (gen !== this.generation) return;
      for (const ev of parseServerMessage(raw)) this.handle(ev, gen);
    };
    ws.onerror = () => { /* onclose follows and reports */ };
    ws.onclose = (event) => { if (gen === this.generation && !this.stopped) this.onClosed(event.code); };
  }

  private handle(ev: LiveEvent, gen: number) {
    switch (ev.kind) {
      case 'setupComplete':
        this.ready = true; this.generating = false; this.lastSpoke = Date.now();
        this.connectedAt = Date.now(); this.h.onStatus('live'); this.startTimers(gen);
        // Only the first connection announces the start. A refreshed connection stays quiet until the timer asks.
        if (!this.announced) { this.announced = true; this.send(textMessage(START_TEXT)); this.generating = true; }
        break;
      case 'audio': this.generating = true; this.setSpeaking(true); this.player?.push(base64ToBytes(ev.data)); break;
      case 'output': this.h.onCaptions(this.captions.push(ev.text)); break;
      case 'turnComplete': this.generating = false; this.lastSpoke = Date.now(); this.h.onCaptions(this.captions.endTurn()); break;
      case 'interrupted': this.player?.clear(); this.generating = false; this.h.onCaptions(this.captions.endTurn()); break;
      case 'goAway': break; // the socket closes soon after; onClosed reconnects with a fresh token
      case 'input': break;
    }
  }

  private startTimers(gen: number) {
    this.clearTimers();
    this.frameTimer = setInterval(() => { void this.sendFrame(gen); }, FRAME_INTERVAL_MS);
    // The model answers turns, not raw video. A quiet timer turn asks it to speak only if guidance changed.
    this.tickTimer = setInterval(() => {
      if (!this.ready || this.generating || this.player?.playing || Date.now() - this.lastSpoke < TICK_AFTER_SILENCE_MS) return;
      this.lastSpoke = Date.now(); this.generating = true; this.send(textMessage(TICK_TEXT));
    }, 2000);
  }
  private clearTimers() {
    if (this.frameTimer) clearInterval(this.frameTimer); if (this.tickTimer) clearInterval(this.tickTimer);
    this.frameTimer = this.tickTimer = null;
  }

  private async sendFrame(gen: number) {
    const ws = this.ws;
    if (this.capturing || !this.ready || gen !== this.generation || !ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > MAX_BUFFERED) return;
    this.capturing = true;
    try {
      const blob = await captureFrame(this.o.video); // JPEG, 640 px long edge, under 512 KB
      if (gen === this.generation) this.send(videoMessage(bytesToBase64(new Uint8Array(await blob.arrayBuffer()))));
    } catch { /* no frame yet; try again next second */ } finally { this.capturing = false; }
  }

  private send(message: string) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(message); }
  private setSpeaking(on: boolean) { if (this.speaking !== on) { this.speaking = on; this.h.onSpeaking(on); } }

  private teardownSocket(code: number) {
    this.clearTimers(); this.ready = false;
    const ws = this.ws; this.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; try { ws.close(code); } catch { /* closed */ } }
  }

  private onClosed(code: number) {
    this.teardownSocket(1000); this.generating = false;
    if (this.connectedAt && Date.now() - this.connectedAt > 60_000) this.reconnects = 0; // a long healthy session earns fresh retries
    this.connectedAt = 0;
    if (this.reconnects >= MAX_RECONNECTS) { this.fail('limit'); return; }
    this.reconnects++;
    this.h.onStatus('reconnecting');
    const gen = this.generation;
    setTimeout(() => { if (!this.stopped && gen === this.generation) void this.connect(); }, code === 1000 ? 200 : 800 * this.reconnects);
  }

  private fail(kind: LiveFailure, detail?: string) {
    this.h.onFailure(kind, detail);
    if (kind === 'mic_denied' || kind === 'mic_error') return; // the camera guide keeps running without the mic
    this.teardownSocket(1000);
    this.stopMic(); this.camera?.getTracks().forEach((t) => t.stop()); this.camera = null;
    this.player?.clear(); void this.ctx?.close().catch(() => {}); this.ctx = null; this.player = null;
    this.stopped = true; this.generation++;
    this.h.onStatus('error');
  }
}
