// Pure helpers for the Gemini Live WebSocket protocol. No browser or Node imports, so `npm run check` can test them.
// Wire shapes: https://ai.google.dev/api/live and https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

export const OUTPUT_SAMPLE_RATE = 24_000; // model audio: raw 16-bit little-endian PCM, 24 kHz
export const INPUT_SAMPLE_RATE = 16_000; // microphone audio the model expects
export const FRAME_INTERVAL_MS = 1000; // documented cap: 1 video frame per second
export const TICK_AFTER_SILENCE_MS = 12_000;
export const GENERATING_TIMEOUT_MS = 15_000; // a silent model must not stop the timer forever
export const START_TEXT = '[start] The walk is starting now. Look at the camera. If the person is at the first checkpoint, say its approved instruction in one short sentence. Otherwise tell them in a few words to face the start of the route.';
export const TICK_TEXT = '[tick] Camera updated. If the person reached the next checkpoint, changed direction, went off route or seems stuck, give one short guidance sentence now. Otherwise stay silent.';

export type LiveEvent =
  | { kind: 'setupComplete' }
  | { kind: 'audio'; data: string }
  | { kind: 'output'; text: string }
  | { kind: 'input'; text: string }
  | { kind: 'turnComplete' }
  | { kind: 'interrupted' }
  | { kind: 'goAway'; timeLeftMs: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "50s", "1.5s" or "{seconds,nanos}" to milliseconds. Unknown shapes mean zero. */
export function durationMs(value: unknown): number {
  if (typeof value === 'string') { const n = Number.parseFloat(value); return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : 0; }
  if (isObject(value)) { const s = Number(value.seconds ?? 0); const n = Number(value.nanos ?? 0); return Number.isFinite(s + n) ? Math.max(0, Math.round(s * 1000 + n / 1e6)) : 0; }
  return 0;
}

/** One server message can carry several events. Malformed or unknown messages give an empty list. */
export function parseServerMessage(raw: string): LiveEvent[] {
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return []; }
  if (!isObject(m)) return [];
  const events: LiveEvent[] = [];
  if (m.setupComplete !== undefined) events.push({ kind: 'setupComplete' });
  if (isObject(m.goAway)) events.push({ kind: 'goAway', timeLeftMs: durationMs(m.goAway.timeLeft) });
  const sc = m.serverContent;
  if (isObject(sc)) {
    if (sc.interrupted === true) events.push({ kind: 'interrupted' });
    const parts = isObject(sc.modelTurn) && Array.isArray(sc.modelTurn.parts) ? sc.modelTurn.parts : [];
    for (const part of parts) {
      const inline = isObject(part) && isObject(part.inlineData) ? part.inlineData : null;
      if (inline && typeof inline.data === 'string' && inline.data && String(inline.mimeType ?? 'audio/pcm').startsWith('audio/pcm')) events.push({ kind: 'audio', data: inline.data });
    }
    if (isObject(sc.outputTranscription) && typeof sc.outputTranscription.text === 'string') events.push({ kind: 'output', text: sc.outputTranscription.text });
    if (isObject(sc.inputTranscription) && typeof sc.inputTranscription.text === 'string') events.push({ kind: 'input', text: sc.inputTranscription.text });
    if (sc.turnComplete === true) events.push({ kind: 'turnComplete' });
  }
  return events;
}

export const liveUrl = (endpoint: string, token: string) => `${endpoint}?access_token=${encodeURIComponent(token)}`;
export const videoMessage = (base64: string) => JSON.stringify({ realtimeInput: { video: { data: base64, mimeType: 'image/jpeg' } } });
export const audioMessage = (base64: string) => JSON.stringify({ realtimeInput: { audio: { data: base64, mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}` } } });
export const textMessage = (text: string) => JSON.stringify({ realtimeInput: { text } });
export const audioEndMessage = () => JSON.stringify({ realtimeInput: { audioStreamEnd: true } });
export const setupMessage = (setup: unknown) => JSON.stringify({ setup });

export function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
/** Little-endian signed 16-bit PCM to floats in [-1, 1). An odd trailing byte is dropped. */
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const n = bytes.length >> 1; const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}
/** Averages samples down to 16 kHz and encodes little-endian 16-bit PCM. */
export function floatToPcm16(input: Float32Array, inputRate: number, outputRate = INPUT_SAMPLE_RATE): Uint8Array {
  const ratio = inputRate / outputRate; const n = Math.floor(input.length / ratio);
  const out = new Uint8Array(n * 2); const view = new DataView(out.buffer);
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * ratio); const to = Math.max(from + 1, Math.min(input.length, Math.floor((i + 1) * ratio)));
    let sum = 0; for (let j = from; j < to; j++) sum += input[j];
    const s = Math.max(-1, Math.min(1, sum / (to - from)));
    view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return out;
}

/** Turns streaming transcription chunks into caption lines. A new chunk after a completed turn starts a new line. */
export function createCaptions(maxLines = 3) {
  let lines: string[] = []; let open = false;
  return {
    push(text: string) { if (open && lines.length) lines[lines.length - 1] += text; else { lines.push(text); open = true; if (lines.length > maxLines) lines.shift(); } return [...lines]; },
    endTurn() { open = false; return [...lines]; },
    reset() { lines = []; open = false; return []; },
    get lines() { return [...lines]; },
  };
}

const textDecoder = new TextDecoder();
/**
 * Socket frames are text or binary. Binary frames arrive as ArrayBuffer (binaryType 'arraybuffer') and are decoded in the
 * same call, so message order is the arrival order. An async Blob.text() could finish out of order and scramble audio.
 */
export function decodeSocketData(data: unknown): string | null {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return textDecoder.decode(data);
  if (ArrayBuffer.isView(data)) return textDecoder.decode(data);
  return null;
}

export interface TickState { ready: boolean; generating: boolean; generatingSince: number; playing: boolean; lastSpoke: number; now: number }
/** Whether the silence timer may send a [tick]. A `generating` flag older than GENERATING_TIMEOUT_MS is treated as cleared. */
export function tickAllowed(s: TickState): boolean {
  if (!s.ready || s.playing) return false;
  if (s.generating && s.now - s.generatingSince < GENERATING_TIMEOUT_MS) return false;
  return s.now - s.lastSpoke >= TICK_AFTER_SILENCE_MS;
}

/** iOS Safari moves an AudioContext to 'interrupted' (calls, Siri, tab switches); browsers may also suspend it. */
export const needsAudioResume = (state: string, running: boolean) => running && (state === 'suspended' || state === 'interrupted');
