import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedServer } from './isolated-server.mjs';
process.on('uncaughtException', (error) => { console.error('FAIL follow frames:', error.message); process.exit(1); });
const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-http-frames-'));
process.once('exit', () => rmSync(dir, { recursive: true, force: true }));
process.env.BREADCRUMB_FRAMES_DIR = dir;
const { base } = await startIsolatedServer(Number(process.argv[2] ?? 3119));
const json = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
try {
  const route = (await (await fetch(base + '/api/routes/demo-route')).json()).value;
  assert((await json('/api/routes/demo-route/approve', { version: 1, reviewedCheckpointIds: route.checkpoints.map((c) => c.id) })).ok);
  const session = await json('/api/sessions', { routeId: route.id, mode: 'mock', locale: 'en' }); assert(session.ok);
  const jpeg = Buffer.from([255, 216, 255, 217]);
  const post = async (query, body = jpeg, type = 'image/jpeg', status = 400) => {
    const response = await fetch(base + '/api/frames' + query, { method: 'POST', headers: { 'content-type': type }, body });
    const result = await response.json(); assert.equal(response.status, status); assert.equal(result.ok, status === 200); return result;
  };
  const valid = await post(`?sessionId=${session.value.id}`, jpeg, 'image/jpeg', 200);
  assert.match(valid.value.mediaId, /^frame_[0-9a-f-]{36}$/);
  assert.deepEqual(readFileSync(join(dir, `${valid.value.mediaId}.jpg`)), jpeg);
  console.log('PASS HTTP JPEG upload returns opaque id and stores in isolated directory');
  await post(`?sessionId=${session.value.id}`, jpeg, 'text/plain');
  await post(`?sessionId=${session.value.id}`, Buffer.alloc(512 * 1024 + 1));
  await post(''); await post('?sessionId=unknown', jpeg, 'image/jpeg', 404);
  await post(`?sessionId=${session.value.id}`, Buffer.from('not JPEG'));
  await post(`?sessionId=${session.value.id}`, Buffer.alloc(0));
  // No Content-Length: the streaming cap must still reject the body.
  const response = await fetch(base + `/api/frames?sessionId=${session.value.id}`, {
    method: 'POST', headers: { 'content-type': 'image/jpeg' }, duplex: 'half',
    body: new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(512 * 1024 + 1)); c.close(); } }),
  });
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_INPUT');
  assert.equal(readdirSync(dir).length, 1);
  console.log('PASS HTTP wrong type, oversized/chunked, missing/unknown session, empty/non-JPEG envelopes');
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(0);
