import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheKey, DEFAULT_VOICE, elevenLabsProvider, loadAudio, MAX_AUDIO_BYTES, MAX_BODY_BYTES, MODEL, speechBody, synthesize, voiceEnabled } from './voice.ts';
import type { Provider } from './voice.ts';
import type { Result } from '../../../contracts/contracts.ts';
import { httpVoice, serverVoiceEnabled } from '../../client/voice.ts';
import { GET as PROBE, POST } from '../../app/api/speech/route.ts';
import { GET } from '../../app/api/speech/[id]/route.ts';

const directory = await mkdtemp(join(tmpdir(), 'voice-check-'));
const originalFetch = globalThis.fetch;
const audio = { bytes: Buffer.from('ID3fixture'), contentType: 'audio/mpeg' };
const request = { text: '  EXIT / Salida\nTurn left.  ', locale: 'en' as const, voiceId: 'default', instructionId: 'opaque:instruction' };
let calls = 0; let cases = 0;
const provider: Provider = async (text, locale, voiceId, signal) => {
  calls++; assert.equal(text, request.text); assert.ok(['en', 'es'].includes(locale));
  assert.ok([DEFAULT_VOICE, 'other'].includes(voiceId)); assert.ok(signal instanceof AbortSignal); return audio;
};
const run = (input: unknown = request, extra = {}) => synthesize(input, { directory, provider, ...extra });
const error = (result: Result<unknown>, code: string, retryable?: boolean) => {
  assert.equal(result.ok, false); if (result.ok) throw new Error('Expected failure');
  assert.equal(result.error.code, code); if (retryable !== undefined) assert.equal(result.error.retryable, retryable);
  assert.doesNotMatch(result.error.message, /secret-provider-body|fixture-key/); cases++; return result.error;
};
try {
  const first = await run(); assert.ok(first.ok); if (first.ok) assert.equal(first.value.cached, false);
  const second = await run({ ...request, instructionId: 'different' });
  assert.ok(second.ok); if (second.ok) assert.equal(second.value.cached, true); assert.equal(calls, 1);
  const es = await run({ ...request, locale: 'es' }); const voice = await run(request, { config: { voiceId: 'other' } });
  assert.ok(es.ok && voice.ok); if (first.ok && es.ok && voice.ok) {
    assert.notEqual(first.value.audioUrl, es.value.audioUrl); assert.notEqual(first.value.audioUrl, voice.value.audioUrl);
  } assert.equal(calls, 3); cases += 3;
  let dedupeCalls = 0;
  const dedupe: Provider = async () => { dedupeCalls++; await new Promise((r) => setTimeout(r, 20)); return audio; };
  assert.ok((await Promise.all(Array.from({ length: 8 }, () => run({ ...request, text: 'concurrent' }, { provider: dedupe })))).every((r) => r.ok));
  assert.equal(dedupeCalls, 1); cases++;
  for (const invalid of [null, {}, { ...request, text: '' }, { ...request, text: ' \n ' }, { ...request, text: 'a'.repeat(501) },
    { ...request, locale: 'fr' }, { ...request, voiceId: 'unknown' }, { ...request, instructionId: '' },
    { ...request, instructionId: 'x'.repeat(201) }, { ...request, instructionId: '\u0000' }]) error(await run(invalid), 'INVALID_INPUT', false);
  error(await synthesize({ ...request, text: 'uncached disabled' }, { directory, config: {} }), 'PROVIDER_UNAVAILABLE', false);
  error(await synthesize({ ...request, text: 'uncached no key' }, { directory, config: { enabled: '1' } }), 'PROVIDER_UNAVAILABLE', false);
  error(await run({ ...request, text: 'timeout' }, { provider: () => new Promise(() => {}), timeoutMs: 20 }), 'PROVIDER_UNAVAILABLE', true);
  for (const badAudio of [{ bytes: Buffer.alloc(0), contentType: 'audio/mpeg' }, { bytes: Buffer.alloc(MAX_AUDIO_BYTES + 1), contentType: 'audio/mpeg' },
    { bytes: Buffer.from('not audio'), contentType: 'audio/mpeg' }, { ...audio, contentType: 'text/html' }]) {
    const before = await readdir(directory);
    error(await run({ ...request, text: 'bad audio' }, { provider: async () => badAudio }), 'PROVIDER_UNAVAILABLE');
    assert.deepEqual(await readdir(directory), before);
  }
  assert.ok(!(await readdir(directory)).some((name) => name.endsWith('.tmp')));
  const adapter = elevenLabsProvider({ enabled: '1', apiKey: 'fixture-key' });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, `https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_VOICE}?output_format=mp3_44100_128`);
    assert.equal(init?.method, 'POST'); assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(new Headers(init?.headers).get('xi-api-key'), 'fixture-key');
    assert.equal(new Headers(init?.headers).get('content-type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), { text: request.text, model_id: MODEL });
    return new Response(audio.bytes, { headers: { 'content-type': audio.contentType } });
  };
  assert.deepEqual(await adapter(request.text, 'en', DEFAULT_VOICE, new AbortController().signal), audio); cases++;
  for (const status of [429, 500, 401]) {
    let cancelled = false;
    globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('secret-provider-body')); }, cancel() { cancelled = true; } }), { status });
    error(await run({ ...request, text: `http ${status}` }, { provider: adapter }), status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', true);
    assert.equal(cancelled, true);
  }
  for (const response of [() => new Response('secret-provider-body'), () => new Response(null, { headers: { 'content-type': 'audio/mpeg' } }),
    () => new Response(Buffer.alloc(MAX_AUDIO_BYTES + 1), { headers: { 'content-type': 'audio/mpeg' } })]) {
    globalThis.fetch = async () => response(); error(await run({ ...request, text: 'invalid response' }, { provider: adapter }), 'PROVIDER_UNAVAILABLE');
  }
  let bodyCancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ pull() {}, cancel() { bodyCancelled = true; return new Promise<void>(() => {}); } }), { headers: { 'content-type': 'audio/mpeg' } });
  error(await run({ ...request, text: 'body timeout' }, { provider: adapter, timeoutMs: 20 }), 'PROVIDER_UNAVAILABLE', true);
  assert.equal(bodyCancelled, true);
  for (const headers of [new Headers({ 'content-length': String(MAX_BODY_BYTES + 1) }), new Headers()]) {
    error(await speechBody(new Request('http://local', { method: 'POST', headers, body: ' '.repeat(MAX_BODY_BYTES + 1) })) as Awaited<ReturnType<typeof synthesize>>, 'INVALID_INPUT');
  }
  error(await speechBody(new Request('http://local', { method: 'POST', body: '{' })) as Awaited<ReturnType<typeof synthesize>>, 'INVALID_INPUT');
  assert.equal((await speechBody(new Request('http://local', { method: 'POST', body: JSON.stringify(request) }))).ok, true); cases++;
  error(await loadAudio('../bad'), 'INVALID_INPUT'); error(await loadAudio('0'.repeat(64), directory), 'NOT_FOUND');
  assert.equal((await loadAudio(cacheKey(request.text, request.locale, DEFAULT_VOICE), directory)).ok, true); cases++;
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(error(await httpVoice.synthesize(request), 'PROVIDER_UNAVAILABLE', true).message, "Can't reach the Breadcrumb server.");
  globalThis.fetch = async () => new Response('not JSON', { status: 404 }); error(await httpVoice.synthesize(request), 'NOT_FOUND', false);
  globalThis.fetch = async (_url, init) => { assert.equal(init?.body, JSON.stringify(request)); return Response.json(first); };
  assert.deepEqual(await httpVoice.synthesize(request), first); cases++;
  // Direct route handlers exercise status mapping without a built app or network listener.
  const oldDirectory = process.env.BREADCRUMB_VOICE_DIR;
  const oldVoice = process.env.ELEVENLABS_VOICE_ID;
  const oldEnabled = process.env.BREADCRUMB_ELEVENLABS_VOICE;
  const oldKey = process.env.ELEVENLABS_API_KEY;
  process.env.BREADCRUMB_VOICE_DIR = directory;
  delete process.env.ELEVENLABS_VOICE_ID; delete process.env.ELEVENLABS_API_KEY;
  process.env.BREADCRUMB_ELEVENLABS_VOICE = '0';
  try {
    for (const [input, status] of [[request, 200], [{ ...request, text: 'route disabled' }, 503], [{}, 400]] as const) {
      const response = await POST(new Request('http://local/api/speech', { method: 'POST', body: JSON.stringify(input) }));
      assert.equal(response.status, status);
      const result = await response.json(); if (status === 200) assert.equal(result.value.cached, true);
      else assert.equal(result.ok, false); cases++;
    }
    for (const [id, status] of [[cacheKey(request.text, request.locale, DEFAULT_VOICE), 200], ['0'.repeat(64), 404], ['bad', 400]] as const) {
      const response = await GET(new Request('http://local'), { params: Promise.resolve({ id }) });
      assert.equal(response.status, status);
      if (status === 200) { assert.equal(response.headers.get('content-type'), audio.contentType); assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio.bytes); }
      else assert.equal((await response.json()).ok, false); cases++;
    }
    // Capability probe: boolean only, follows the env flags, never throws on the client.
    for (const [flag, key, enabled] of [['0', 'k', false], ['1', undefined, false], ['1', 'k', true]] as const) {
      process.env.BREADCRUMB_ELEVENLABS_VOICE = flag;
      if (key) process.env.ELEVENLABS_API_KEY = key; else delete process.env.ELEVENLABS_API_KEY;
      const response = await PROBE(); const probe = await response.json();
      assert.deepEqual([response.status, probe, voiceEnabled()], [200, { ok: true, value: { enabled } }, enabled]); cases++;
    }
    globalThis.fetch = async () => Response.json({ ok: true, value: { enabled: true } }); assert.equal(await serverVoiceEnabled(), true);
    globalThis.fetch = async () => Response.json({ ok: true, value: { enabled: false } }); assert.equal(await serverVoiceEnabled(), false);
    globalThis.fetch = async () => new Response('<html>', { status: 404 }); assert.equal(await serverVoiceEnabled(), false);
    globalThis.fetch = async () => { throw new Error('offline'); }; assert.equal(await serverVoiceEnabled(), false); cases++;
    let cancelled = false;
    const streamed = new Request('http://local/api/speech', { method: 'POST', duplex: 'half',
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(MAX_BODY_BYTES + 1)); }, cancel() { cancelled = true; } }),
    } as RequestInit & { duplex: string });
    assert.equal((await POST(streamed)).status, 400); assert.equal(cancelled, true); cases++;
  } finally {
    for (const [name, value] of [['BREADCRUMB_VOICE_DIR', oldDirectory], ['ELEVENLABS_VOICE_ID', oldVoice],
      ['BREADCRUMB_ELEVENLABS_VOICE', oldEnabled], ['ELEVENLABS_API_KEY', oldKey]]) {
      if (value === undefined) delete process.env[name!]; else process.env[name!] = value;
    }
  }
  assert.equal((await readdir(directory)).length, 4);
  assert.ok(!(await readdir(directory)).some((name) => name.endsWith('.tmp')));
  console.log(`voice checks passed (${cases} cases; no network calls)`);
} finally { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }
