import assert from 'node:assert/strict';
import { fixtureServer, request } from './voice-fixture.mjs';
const { base, audio, id } = await fixtureServer(Number(process.argv[2] ?? 3118));
async function post(body) {
  const response = await fetch(`${base}/api/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const result = await response.json(); console.log('POST /api/speech', response.status, result.ok ? `cached:${result.value.cached}` : result.error.code);
  return { status: response.status, ...result };
}
for (const body of ['{', {}, { ...request, text: ' ' }, { ...request, text: 'a'.repeat(501) }, { ...request, voiceId: 'bad' },
  { ...request, locale: 'fr' }, { ...request, instructionId: '' }, ' '.repeat(8193)]) {
  const result = await post(body); assert.deepEqual([result.status, result.error.code, result.error.retryable], [400, 'INVALID_INPUT', false]);
}
const missing = await post({ ...request, text: 'uncached disabled' });
assert.deepEqual([missing.status, missing.error.code, missing.error.retryable], [503, 'PROVIDER_UNAVAILABLE', false]);
const streamed = await fetch(`${base}/api/speech`, { method: 'POST', duplex: 'half', headers: { 'content-type': 'application/json' },
  body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); } }),
});
assert.equal(streamed.status, 400); assert.equal((await streamed.json()).error.code, 'INVALID_INPUT');
console.log('POST /api/speech (no Content-Length, oversized)', streamed.status, 'INVALID_INPUT');
const cached = await post(request); assert.equal(cached.status, 200); assert.equal(cached.value.cached, true);
assert.equal(cached.value.audioUrl, `/api/speech/${id}`);
const delivered = await fetch(base + cached.value.audioUrl);
assert.equal(delivered.status, 200); assert.equal(delivered.headers.get('content-type'), audio.contentType);
assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), audio.bytes);
for (const [id, status, code] of [['bad-id', 400, 'INVALID_INPUT'], ['0'.repeat(64), 404, 'NOT_FOUND']]) {
  const response = await fetch(`${base}/api/speech/${id}`); assert.equal(response.status, status); assert.equal((await response.json()).error.code, code);
}
console.log('voice smoke passed; TEST CLIP - generated tone, not ElevenLabs');
process.exit(0);
