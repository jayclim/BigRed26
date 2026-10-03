import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveFrame, readFrame } from './frames.ts';
import { MAX_FRAME_BYTES } from '../../features/guide/frameCapture.ts';
const dir = await mkdtemp(join(tmpdir(), 'breadcrumb-frame-check-'));
const jpeg = new Uint8Array([255, 216, 255, 217]);
let now = Date.now();
try {
  const saved = await saveFrame(jpeg, dir, () => now);
  assert(saved.ok);
  assert.match(saved.value.mediaId, /^frame_[0-9a-f-]{36}$/);
  const read = await readFrame(saved.value.mediaId, dir);
  assert(read.ok); assert.deepEqual([...read.value], [...jpeg]);
  for (const bytes of [new Uint8Array(), new Uint8Array(MAX_FRAME_BYTES + 1), new Uint8Array([1, 2, 3])]) assert.equal((await saveFrame(bytes, dir)).ok, false);
  for (const id of ['../x', 'frame_../', 'data:image/jpeg;base64,AA', `${saved.value.mediaId}/x`]) {
    const result = await readFrame(id, dir); assert(!result.ok); assert.equal(result.error.code, 'INVALID_INPUT');
  }
  console.log('PASS JPEG validation, opaque ids, safe reads');
  await utimes(join(dir, `${saved.value.mediaId}.jpg`), (now - 600001) / 1000, (now - 600001) / 1000);
  assert((await saveFrame(jpeg, dir, () => now)).ok);
  assert.equal((await readFrame(saved.value.mediaId, dir)).ok, false);
  await Promise.all(Array.from({ length: 205 }, () => saveFrame(jpeg, dir, () => ++now)));
  assert.equal((await readdir(dir)).length, 200);
  console.log('PASS retention age and concurrent count cap');
} finally { await rm(dir, { recursive: true, force: true }); }

// Exercise the exact route implementation without a listening server.
const { receiveFrame } = await import('./http.ts');
const httpDir = await mkdtemp(join(tmpdir(), 'breadcrumb-frame-request-check-'));
const sessionCore = { getSession: async (id: string) => id === 'existing'
  ? { ok: true as const, value: { id, routeId: 'fixture', routeVersion: 1, locale: 'en' as const, mode: 'mock' as const, lastConfirmedCheckpointId: null, lastAcceptedSequence: 0 } }
  : { ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'Session not found.', retryable: false } } };
try {
  for (const [query, type, bytes, length, expected] of [
    ['?sessionId=existing', 'image/jpeg', jpeg, undefined, 200],
    ['?sessionId=existing', 'text/plain', jpeg, undefined, 400],
    ['', 'image/jpeg', jpeg, undefined, 400],
    ['?sessionId=missing', 'image/jpeg', jpeg, undefined, 404],
    ['?sessionId=existing', 'image/jpeg', new Uint8Array([1, 2, 3]), undefined, 400],
    ['?sessionId=existing', 'image/jpeg', jpeg, 'NaN', 400],
    ['?sessionId=existing', 'image/jpeg', jpeg, '-1', 400],
    ['?sessionId=existing', 'image/jpeg', jpeg, String(MAX_FRAME_BYTES + 1), 400],
    ['?sessionId=existing', 'image/jpeg', new Uint8Array(MAX_FRAME_BYTES + 1), undefined, 400],
  ] as const) {
    const headers: Record<string, string> = { 'content-type': type };
    if (length !== undefined) headers['content-length'] = length;
    const response = await receiveFrame(new Request(`http://localhost/api/frames${query}`, { method: 'POST', headers, body: bytes }), sessionCore, httpDir);
    assert.equal(response.status, expected);
    const result = await response.json();
    assert.equal(result.ok, expected === 200);
    if (expected !== 200) assert.equal(result.error.code, expected === 404 ? 'NOT_FOUND' : 'INVALID_INPUT');
  }
  assert.equal((await readdir(httpDir)).length, 1);
  console.log('PASS direct HTTP handler: valid upload, session, header, JPEG and streamed byte validation');
} finally { await rm(httpDir, { recursive: true, force: true }); }
