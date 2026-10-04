import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { ErrorCode, Locale, Result, SpeechClip, SpeechRequest } from '../../../contracts/contracts.ts';
import { LocaleSchema } from '../../../contracts/schemas.ts';

export const MAX_BODY_BYTES = 8192;
export const MAX_AUDIO_BYTES = 2_000_000;
export const DEFAULT_VOICE = 'JBFqnCBsd6RMkjVDRZzb';
export const MODEL = 'eleven_multilingual_v2';
export const SpeechSchema = z.object({
  text: z.string().max(500).refine((text) => /\S/u.test(text)),
  locale: LocaleSchema, voiceId: z.literal('default'),
  instructionId: z.string().min(1).max(200).refine((id) => /\S/u.test(id) && !/[\u0000-\u001f\u007f]/u.test(id)),
}).strict() satisfies z.ZodType<SpeechRequest>;
export const fail = (code: ErrorCode, message: string, retryable = false): Result<never> =>
  ({ ok: false, error: { code, message, retryable } });
export interface VoiceConfig { enabled?: string; apiKey?: string; voiceId?: string }
export const voiceConfig = (): VoiceConfig => ({ enabled: process.env.BREADCRUMB_ELEVENLABS_VOICE,
  apiKey: process.env.ELEVENLABS_API_KEY, voiceId: process.env.ELEVENLABS_VOICE_ID });
export const voiceEnabled = (config = voiceConfig()): boolean => config.enabled === '1' && !!config.apiKey;
export const voiceDirectory = () => resolve(/* turbopackIgnore: true */ process.env.BREADCRUMB_VOICE_DIR ??
  join(dirname(resolve(/* turbopackIgnore: true */ process.env.BREADCRUMB_DATA_FILE ?? '.data/store.json')), 'voice'));
export const cacheKey = (text: string, locale: Locale, providerVoiceId: string) =>
  createHash('sha256').update(JSON.stringify([text, locale, providerVoiceId])).digest('hex');
export interface Audio { bytes: Uint8Array; contentType: string }
export type Provider = (text: string, locale: Locale, providerVoiceId: string, signal: AbortSignal) => Promise<Audio>;
class ProviderError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) { super(message); this.code = code; }
}
const audioTypes = ['audio/mpeg', 'audio/wav'];
const validAudio = (audio: Audio) => audio.bytes instanceof Uint8Array && audio.bytes.byteLength > 0 &&
  audio.bytes.byteLength <= MAX_AUDIO_BYTES && audioTypes.includes(audio.contentType) &&
  (audio.contentType === 'audio/wav'
    ? Buffer.from(audio.bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(audio.bytes.subarray(8, 12)).toString() === 'WAVE'
    : Buffer.from(audio.bytes.subarray(0, 3)).toString() === 'ID3' || (audio.bytes[0] === 255 && (audio.bytes[1] & 224) === 224));

export function elevenLabsProvider(config: VoiceConfig): Provider {
  return async (text, _locale, providerVoiceId, signal) => {
    if (config.enabled !== '1' || !config.apiKey) throw new ProviderError('PROVIDER_UNAVAILABLE', 'Voice is not enabled.');
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(providerVoiceId)}?output_format=mp3_44100_128`, {
      method: 'POST', signal, headers: { 'xi-api-key': config.apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL }),
    });
    const cancelBody = () => { void response.body?.cancel().catch(() => {}); };
    if (!response.ok) {
      cancelBody();
      throw new ProviderError(response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', 'Voice provider request failed.');
    }
    const contentType = response.headers.get('content-type')?.split(';')[0].trim() ?? '';
    if (contentType !== 'audio/mpeg' || Number(response.headers.get('content-length')) > MAX_AUDIO_BYTES || !response.body) {
      cancelBody(); throw new ProviderError('PROVIDER_UNAVAILABLE', 'Voice provider returned invalid audio.');
    }
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const chunks: Uint8Array[] = []; let size = 0;
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_AUDIO_BYTES) throw new Error('Audio limit');
        chunks.push(value);
      }
      const audio = { bytes: Buffer.concat(chunks, size), contentType };
      if (!validAudio(audio)) throw new Error('Invalid audio');
      return audio;
    } catch { cancel(); throw new ProviderError('PROVIDER_UNAVAILABLE', 'Voice provider returned invalid audio.'); }
    finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  };
}

// One atomic file holds a short MIME header and audio. No metadata pair can be partially published.
export async function storeAudio(directory: string, id: string, audio: Audio) {
  if (!/^[a-f0-9]{64}$/.test(id) || !validAudio(audio)) throw new Error('Invalid cache entry');
  await mkdir(directory, { recursive: true });
  const file = join(directory, id); const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, Buffer.concat([Buffer.from(`${audio.contentType}\n`), audio.bytes]), { flag: 'wx' });
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}
export async function loadAudio(id: string, directory = voiceDirectory()): Promise<Result<Audio>> {
  if (!/^[a-f0-9]{64}$/.test(id)) return fail('INVALID_INPUT', 'Audio id must be lowercase SHA-256 hex.');
  try {
    const file = await open(/* turbopackIgnore: true */ join(directory, id), 'r');
    try {
      if ((await file.stat()).size > MAX_AUDIO_BYTES + 32) throw new Error('Cache limit');
      const data = await file.readFile(); const split = data.indexOf(10);
      const audio = { contentType: data.subarray(0, split).toString(), bytes: data.subarray(split + 1) };
      if (split < 0 || !validAudio(audio)) throw new Error('Invalid cache');
      return { ok: true, value: audio };
    } finally { await file.close(); }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? fail('NOT_FOUND', 'Audio not found.')
      : fail('PROVIDER_UNAVAILABLE', 'Audio cache could not be read.', true);
  }
}
const pending = new Map<string, Promise<Result<SpeechClip>>>();
export async function synthesize(input: unknown, deps: { provider?: Provider; config?: VoiceConfig; directory?: string; timeoutMs?: number } = {}): Promise<Result<SpeechClip>> {
  const parsed = SpeechSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', 'Send text (1–500 characters), en/es locale, default voice and a valid instructionId.');
  const request = parsed.data; const config = deps.config ?? voiceConfig();
  const providerVoiceId = config.voiceId || DEFAULT_VOICE;
  const id = cacheKey(request.text, request.locale, providerVoiceId);
  const directory = resolve(/* turbopackIgnore: true */ deps.directory ?? voiceDirectory());
  const key = join(directory, id);
  const existing = pending.get(key); if (existing) return existing;
  const work = async (): Promise<Result<SpeechClip>> => {
    const clip = (cached: boolean): Result<SpeechClip> => ({ ok: true, value: { audioUrl: `/api/speech/${id}`, provider: 'elevenlabs', cached } });
    const stored = await loadAudio(id, directory);
    if (stored.ok) return clip(true);
    if (stored.error.code !== 'NOT_FOUND') return stored;
    if (!deps.provider && (config.enabled !== '1' || !config.apiKey)) return fail('PROVIDER_UNAVAILABLE', 'Voice is not enabled. Set BREADCRUMB_ELEVENLABS_VOICE=1 and ELEVENLABS_API_KEY after the provider budget is confirmed.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Timeout')); }, deps.timeoutMs ?? 15_000); });
    try {
      const audio = await Promise.race([(deps.provider ?? elevenLabsProvider(config))(request.text, request.locale, providerVoiceId, controller.signal), timeout]);
      if (!validAudio(audio)) throw new Error('Invalid audio');
      await storeAudio(directory, id, audio);
      return clip(false);
    } catch (error) {
      if (controller.signal.aborted) return fail('PROVIDER_UNAVAILABLE', 'Voice request timed out.', true);
      return fail(error instanceof ProviderError ? error.code : 'PROVIDER_UNAVAILABLE', 'Voice synthesis failed. Check provider access and local storage.', true);
    } finally { clearTimeout(timer!); }
  };
  const result = work(); pending.set(key, result);
  try { return await result; } finally { pending.delete(key); }
}

export async function speechBody(req: Request): Promise<Result<unknown>> {
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    void req.body?.cancel().catch(() => {}); return fail('INVALID_INPUT', 'Speech body is too large or has invalid Content-Length.');
  }
  const reader = req.body?.getReader(); if (!reader) return fail('INVALID_INPUT', 'Body must be JSON.');
  try {
    let size = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { void reader.cancel().catch(() => {}); return fail('INVALID_INPUT', 'Speech body is too large.'); }
      chunks.push(value);
    }
    return { ok: true, value: JSON.parse(Buffer.concat(chunks, size).toString('utf8')) };
  } catch { return fail('INVALID_INPUT', 'Body must be JSON.'); }
  finally { reader.releaseLock(); }
}
