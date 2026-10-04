// HTTP smoke test: `npm run build && node scripts/smoke-api.mjs [port]`. Starts its own server on a
// throwaway data file (scripts/isolated-server.mjs), walks draft -> approve -> session -> frames -> locale.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_MEDIA_REQUEST_BYTES } from '../src/shared/mediaLimits.ts';
import { startIsolatedServer } from './isolated-server.mjs';

// The child receives its own media directory, even if the host has an override.
const mediaDir = mkdtempSync(join(tmpdir(), 'breadcrumb-media-smoke-'));
const oldMediaDir = process.env.BREADCRUMB_MEDIA_DIR;
process.env.BREADCRUMB_MEDIA_DIR = mediaDir;
process.on('exit', () => rmSync(mediaDir, { recursive: true, force: true }));
// Explicitly disable extraction, live recognition and generated voice for this child; never pass provider credentials.
const savedGeminiEnv = Object.fromEntries(['BREADCRUMB_GEMINI_EXTRACTION', 'BREADCRUMB_GEMINI_RECOGNITION', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'BREADCRUMB_ELEVENLABS_VOICE', 'ELEVENLABS_API_KEY', 'BREADCRUMB_GEMINI_LIVE', 'GEMINI_LIVE_MODEL', 'BREADCRUMB_AGENT', 'XAI_API_KEY', 'BREADCRUMB_AGENT_SECRET'].map((key) => [key, process.env[key]]));
for (const key of Object.keys(savedGeminiEnv)) delete process.env[key];
process.env.BREADCRUMB_GEMINI_EXTRACTION = '0';
process.env.BREADCRUMB_GEMINI_RECOGNITION = '0';
process.env.BREADCRUMB_ELEVENLABS_VOICE = '0';
process.env.BREADCRUMB_GEMINI_LIVE = '0';
const { base } = await startIsolatedServer(Number(process.argv[2] ?? 3107));
for (const [key, value] of Object.entries(savedGeminiEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
if (oldMediaDir === undefined) delete process.env.BREADCRUMB_MEDIA_DIR;
else process.env.BREADCRUMB_MEDIA_DIR = oldMediaDir;
const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  console.log(method.padEnd(5), path.padEnd(48), res.status, json.ok ? (json.value?.state ?? json.value?.status ?? 'ok') : json.error.code);
  return { status: res.status, ...json };
};

const voiceProbe = await call('GET', '/api/speech');
assert.deepEqual([voiceProbe.status, voiceProbe.value.enabled], [200, false]); // guide keeps labeled browser speech
const liveProbe = await call('GET', '/api/live/token');
assert.deepEqual([liveProbe.status, liveProbe.value.enabled], [200, false]);
const liveDisabled = await call('POST', '/api/live/token', { routeId: 'anything', locale: 'en' });
assert.equal(liveDisabled.status, 503);
assert.equal(liveDisabled.error.code, 'PROVIDER_UNAVAILABLE');
const agentDisabled = await call('POST', '/api/agent/message', { conversationId: 'smoke', text: 'hello' });
assert.equal(agentDisabled.status, 503); // no flag, key or secret: the iMessage agent endpoint refuses before any provider call
assert.equal(agentDisabled.error.code, 'PROVIDER_UNAVAILABLE');
const extractionDisabled = await call('POST', `/api/media/${randomUUID()}/extract`);
assert.equal(extractionDisabled.status, 503);
assert.equal(extractionDisabled.error.code, 'PROVIDER_UNAVAILABLE');
assert.match(extractionDisabled.error.message, /not enabled/);

// Synthetic signature, not playable footage and never used to create a route.
const mp4 = Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const upload = async (bytes) => {
  const form = new FormData();
  form.set('file', new File([bytes], 'synthetic.mp4', { type: 'video/mp4' }));
  const res = await fetch(`${base}/api/media`, { method: 'POST', body: form });
  const json = await res.json();
  console.log('POST ', '/api/media'.padEnd(48), res.status, json.ok ? 'stored, extraction pending' : json.error.code);
  return { status: res.status, ...json };
};
const uploaded = await upload(mp4);
assert.equal(uploaded.status, 200);
assert.equal(uploaded.value.extraction, 'pending');
assert.deepEqual(readFileSync(join(mediaDir, `${uploaded.value.mediaId}.mp4`)), Buffer.from(mp4));
assert.deepEqual(JSON.parse(readFileSync(join(mediaDir, `${uploaded.value.mediaId}.json`), 'utf8')), {
  id: uploaded.value.mediaId, originalName: 'synthetic.mp4', type: 'video/mp4', size: mp4.length,
  uploadedAt: uploaded.value.uploadedAt,
});
for (const bytes of [new Uint8Array(), Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8])]) {
  const rejected = await upload(bytes);
  assert.deepEqual([rejected.status, rejected.error.code], [400, 'INVALID_INPUT']);
}
const nonMultipart = await call('POST', '/api/media', { file: 'not a video' });
assert.deepEqual([nonMultipart.status, nonMultipart.error.code], [400, 'INVALID_INPUT']);
const nonMultipartHeaders = await fetch(`${base}/api/media`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(nonMultipartHeaders.headers.get('connection'), 'close');
await nonMultipartHeaders.arrayBuffer();
assert.equal(readdirSync(mediaDir).length, 2); // rejected uploads and temp files left nothing behind

// A real chunked HTTP upload: no Content-Length and no large fixture on disk.
const beforeOversized = readdirSync(mediaDir).sort();
const boundary = 'breadcrumb-streamed-limit';
const encoder = new TextEncoder();
const prefix = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
const chunk = new Uint8Array(64 * 1024);
// The server answers 400 before it reads the whole body. Shared fetch (undici) then keeps that half-used socket
// in its pool, and a later request on it stalls ~6 s and fails with ECONNRESET. So this one request uses its own
// node:http connection (agent: false) that is destroyed after the response and never touches the fetch pool.
// ponytail: node:http instead of fetch for this request only; fetch cannot opt out of its shared pool.
const oversized = await new Promise((resolve, reject) => {
  const req = httpRequest(`${base}/api/media`, {
    method: 'POST', agent: false,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'transfer-encoding': 'chunked' },
  });
  assert.equal(req.getHeader('content-length'), undefined); // no Content-Length: a real chunked upload
  let responded = false;
  req.on('response', (res) => {
    responded = true; // stop sending; the server has already decided
    const parts = [];
    res.on('data', (part) => parts.push(part));
    res.on('error', reject);
    res.on('end', () => {
      resolve({ status: res.statusCode, connection: res.headers.connection, json: JSON.parse(Buffer.concat(parts).toString('utf8')) });
      req.destroy();
    });
  });
  // A write error or reset after the response head arrived is expected; without any response it is a failure.
  req.on('error', (error) => { if (!responded) reject(error); });
  req.on('close', () => { if (!responded) reject(new Error('connection closed before the server responded')); });
  const closed = new Promise((done) => req.once('close', done)); // one listener, not one per backpressure wait
  const send = async (bytes) => { if (!req.write(bytes)) await Promise.race([once(req, 'drain'), closed]); };
  (async () => {
    await send(prefix);
    await send(mp4); // signature only; the generated bytes are not playable footage
    for (let remaining = MAX_MEDIA_REQUEST_BYTES + chunk.byteLength - mp4.byteLength; remaining > 0 && !responded && !req.destroyed;) {
      const size = Math.min(remaining, chunk.byteLength);
      await send(chunk.subarray(0, size));
      remaining -= size;
    }
    if (!responded && !req.destroyed) { await send(suffix); req.end(); }
  })().catch((error) => { if (!responded) reject(error); });
});
assert.deepEqual([oversized.status, oversized.json.error.code, oversized.json.error.retryable], [400, 'INVALID_INPUT', false]);
assert.match(oversized.json.error.message, /upload body is too large/);
assert.equal(oversized.connection, 'close'); // the server ends a connection whose body it left unread
assert.deepEqual(readdirSync(mediaDir).sort(), beforeOversized);
console.log('POST ', '/api/media (chunked over cap)'.padEnd(48), oversized.status, oversized.json.error.code);

const listed = await call('GET', '/api/routes');
assert.equal(listed.status, 200);
const listedDemo = listed.value.find((r) => r.id === 'demo-route');
assert.ok(listedDemo, 'route list includes demo-route');
assert.deepEqual([listedDemo.latestStatus, listedDemo.approvedVersion], ['draft', null]);
assert.ok(listedDemo.checkpointCount > 0 && listedDemo.name && listedDemo.destinationLabel);
const route = (await call('GET', '/api/routes/demo-route')).value;
assert.equal(route.status, 'draft');
assert.equal((await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'mock' })).status, 409);
assert.equal((await call('PUT', '/api/routes/demo-route/draft', { ...route, version: 'x' })).status, 400);
const edited = { ...route, checkpoints: route.checkpoints.map((c) => c.id === 'mural' ? { ...c, instruction: { ...c.instruction, en: 'Turn left at the blue mural.' } } : c) };
assert.equal((await call('PUT', '/api/routes/demo-route/draft', edited)).status, 200);
assert.equal((await call('POST', '/api/routes/demo-route/approve', { version: 1, reviewedCheckpointIds: ['entrance'] })).status, 409);
const ids = route.checkpoints.map((c) => c.id);
assert.equal((await call('POST', '/api/routes/demo-route/approve', { version: 1, reviewedCheckpointIds: ids })).value.status, 'approved');
assert.equal((await call('GET', '/api/routes')).value.find((r) => r.id === 'demo-route').approvedVersion, 1);
assert.equal((await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'live' })).status, 503);

const s = (await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'mock' })).value;
const frame = async (mediaId) => {
  const { sequence, routeVersion } = (await call('POST', `/api/sessions/${s.id}/frame-sequence`, {})).value;
  return call('POST', `/api/sessions/${s.id}/frame`, { sessionId: s.id, routeVersion, sequence, capturedAt: new Date().toISOString(), mediaId });
};
assert.equal((await frame('mock:unrelated')).value.direction, null);
assert.equal((await frame('mock:entrance:unknown-approach')).value.state, 'reorient');
assert.equal((await frame('mock:entrance:approach')).value.direction, 'forward');
assert.equal((await frame('mock:mural:approach')).value.text, 'Turn left at the blue mural.');
assert.equal((await frame('mock:provider-error')).status, 503);
await call('PATCH', `/api/sessions/${s.id}/locale`, { locale: 'es' });
const es = (await call('GET', `/api/sessions/${s.id}/guidance`)).value;
assert.deepEqual([es.state, es.checkpointId, es.direction, es.locale], ['guiding', 'mural', 'left', 'es']);
assert.equal((await frame('mock:destination:approach')).value.text, 'Has llegado a la sala 204.');
assert.equal((await call('POST', `/api/sessions/${s.id}/frame`, { sessionId: s.id, routeVersion: 1, sequence: 1, capturedAt: new Date().toISOString(), mediaId: 'mock:unrelated' })).status, 409);

const actionRouteId = 'action-fixture';
const actionRoute = (await call('GET', `/api/routes/${actionRouteId}`)).value;
const actionCheckpointIds = actionRoute.checkpoints.map((c) => c.id);
assert.equal((await call('POST', `/api/routes/${actionRouteId}/approve`, {
  version: actionRoute.version, reviewedCheckpointIds: actionCheckpointIds,
})).value.status, 'approved');
const actionSession = (await call('POST', '/api/sessions', {
  routeId: actionRouteId, locale: 'en', mode: 'mock',
})).value;
const reserveActionSequence = async () => (await call('POST', `/api/sessions/${actionSession.id}/frame-sequence`, {})).value;
const completeAction = (body) => call('POST', `/api/sessions/${actionSession.id}/complete-action`, body);
const inactiveSequence = await reserveActionSequence();
const inactiveCompletion = await completeAction({
  routeVersion: inactiveSequence.routeVersion, sequence: inactiveSequence.sequence, checkpointId: 'elevator',
});
assert.deepEqual([inactiveCompletion.status, inactiveCompletion.error.code], [400, 'INVALID_INPUT']);

const actionFrame = async (mediaId) => {
  const { sequence, routeVersion } = await reserveActionSequence();
  return call('POST', `/api/sessions/${actionSession.id}/frame`, {
    sessionId: actionSession.id, routeVersion, sequence, capturedAt: new Date().toISOString(), mediaId,
  });
};
const similarDoor = await actionFrame('mock:door-b214:similar-door');
assert.equal(similarDoor.value.checkpointId, null); // B215 evidence must not select B214.
const activeAction = await actionFrame('mock:door-b214:approach');
assert.deepEqual([activeAction.value.state, activeAction.value.checkpointId, activeAction.value.direction], [
  'guiding', 'door-b214', null,
]);

const staleVersionSequence = await reserveActionSequence();
const staleVersion = await completeAction({
  routeVersion: staleVersionSequence.routeVersion + 1,
  sequence: staleVersionSequence.sequence,
  checkpointId: 'door-b214',
});
assert.deepEqual([staleVersion.status, staleVersion.error.code], [409, 'STALE_VERSION']);
const validCompletion = await reserveActionSequence();
const completionRequest = {
  routeVersion: validCompletion.routeVersion,
  sequence: validCompletion.sequence,
  checkpointId: 'door-b214',
};
const completed = await completeAction(completionRequest);
assert.equal(completed.status, 200);
assert.ok(completed.value.evidence.some((e) => e.includes('Manual')));
assert.notEqual(completed.value.state, 'guiding');
assert.equal(completed.value.direction, null);
const repeatedCompletion = await completeAction(completionRequest);
assert.deepEqual([repeatedCompletion.status, repeatedCompletion.error.code], [409, 'STALE_FRAME']);
console.log('smoke passed');
process.exit(0);
