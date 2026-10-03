// Synthetic container headers only; these fixtures are not playable route footage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_MEDIA_BYTES, MAX_MEDIA_REQUEST_BYTES, mediaInputError } from '../../shared/mediaLimits.ts';
import { mediaDirectory, storeMedia, storeMediaUpload, validateMedia } from './media.ts';

const bmff = Uint8Array.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const webm = Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const fixtures = [
  { type: 'video/mp4', extension: 'mp4', bytes: bmff },
  { type: 'video/quicktime', extension: 'mov', bytes: bmff },
  { type: 'video/webm', extension: 'webm', bytes: webm },
];
for (const { type, extension, bytes } of fixtures) {
  assert.deepEqual(validateMedia({ type, size: bytes.length }, bytes), { ok: true, value: { extension } });
}
for (const [file, header] of [
  [{ type: 'video/mp4', size: 0 }, bmff],
  [{ type: 'video/mp4', size: 8 }, webm],
  [{ type: 'video/webm', size: 16 }, bmff],
  [{ type: 'video/quicktime', size: 4 }, bmff.slice(0, 4)],
  [{ type: 'image/png', size: 16 }, bmff],
  [{ type: '', size: 16 }, bmff],
  [{ type: 'video/mp4', size: MAX_MEDIA_BYTES + 1 }, bmff],
] as const) {
  const result = validateMedia(file, header);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'INVALID_INPUT');
    assert.equal(result.error.retryable, false);
    assert.match(result.error.message, /100 MB/);
  }
}
assert.equal(mediaInputError({ type: 'video/mp4', size: MAX_MEDIA_BYTES }), null);

const directory = await mkdtemp(join(tmpdir(), 'breadcrumb-media-check-'));
const oldDataFile = process.env.BREADCRUMB_DATA_FILE;
const oldMediaDir = process.env.BREADCRUMB_MEDIA_DIR;
try {
  process.env.BREADCRUMB_DATA_FILE = join(directory, 'store.json');
  delete process.env.BREADCRUMB_MEDIA_DIR;
  assert.equal(mediaDirectory(), join(directory, 'media'));
  process.env.BREADCRUMB_MEDIA_DIR = join(directory, 'custom-media');
  assert.equal(mediaDirectory(), process.env.BREADCRUMB_MEDIA_DIR);

  const emptyDirectory = await readdir(directory);
  // An endless source must be cancelled near the cap, with or without a false length header.
  for (const length of [null, '1']) {
    const cap = 256;
    const chunk = new Uint8Array(64);
    let bytesPulled = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { bytesPulled += chunk.byteLength; controller.enqueue(chunk); },
      cancel() { cancelled = true; },
    });
    const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=bounded' });
    if (length !== null) headers.set('content-length', length);
    const init = { method: 'POST', headers, body: stream, duplex: 'half' };
    const req = new Request('http://breadcrumb.test/api/media', init);
    assert.equal(req.headers.get('content-length'), length);
    const rejected = await storeMediaUpload(req, cap, directory);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.deepEqual([rejected.error.code, rejected.error.retryable], ['INVALID_INPUT', false]);
      assert.match(rejected.error.message, /upload body is too large/);
    }
    assert.equal(cancelled, true, 'the endless request source was cancelled');
    assert.ok(bytesPulled > cap && bytesPulled <= cap + 2 * chunk.byteLength,
      `pulled ${bytesPulled} bytes for a ${cap}-byte cap`);
    assert.deepEqual(await readdir(directory), emptyDirectory);
  }

  for (const fields of ['duplicate', 'extra', 'missing', 'wrong-name', 'text-file']) {
    const form = new FormData();
    const file = new File([bmff], 'synthetic.mp4', { type: 'video/mp4' });
    if (fields === 'duplicate' || fields === 'extra') form.append('file', file);
    if (fields === 'duplicate') form.append('file', file);
    if (fields === 'extra') form.append('note', 'not allowed');
    if (fields === 'wrong-name') form.append('video', file);
    if (fields === 'text-file') form.append('file', 'not a File');
    const req = new Request('http://breadcrumb.test/api/media', { method: 'POST', body: form });
    const rejected = await storeMediaUpload(req, MAX_MEDIA_REQUEST_BYTES, directory);
    assert.equal(rejected.ok, false, fields);
    if (!rejected.ok) assert.deepEqual([rejected.error.code, rejected.error.retryable], ['INVALID_INPUT', false]);
    assert.deepEqual(await readdir(directory), emptyDirectory, fields);
  }

  for (const { type, extension, bytes } of fixtures) {
    const file = new File([bytes], '../folder\\route\u0000.mov', { type });
    const form = new FormData();
    form.append('file', file);
    const stored = await storeMediaUpload(new Request('http://breadcrumb.test/api/media', {
      method: 'POST', body: form,
    }), MAX_MEDIA_REQUEST_BYTES, directory);
    assert.ok(stored.ok);
    const value = stored.value;
    assert.match(value.mediaId, /^[0-9a-f-]{36}$/);
    assert.equal(value.name, 'route.mov');
    assert.equal(value.extraction, 'pending');
    assert.equal(value.size, bytes.length);
    assert.ok(Number.isFinite(Date.parse(value.uploadedAt)));
    assert.deepEqual(await readFile(join(directory, `${value.mediaId}.${extension}`)), Buffer.from(bytes));
    assert.deepEqual(JSON.parse(await readFile(join(directory, `${value.mediaId}.json`), 'utf8')), {
      id: value.mediaId, originalName: 'route.mov', type, size: bytes.length, uploadedAt: value.uploadedAt,
    });
  }
  const before = await readdir(directory);
  const invalid = await storeMedia(new File([webm], 'fake.mp4', { type: 'video/mp4' }), directory);
  assert.equal(invalid.ok, false);
  assert.deepEqual(await readdir(directory), before);
  assert.ok(before.every((name) => !name.endsWith('.tmp')));

  // Fail the last rename after the video reached its final path; remove the whole partial pair.
  const originalRename = fs.promises.rename;
  let mediaRenamed = false;
  fs.promises.rename = async (source, destination) => {
    if (String(destination).endsWith('.json')) throw new Error('Synthetic metadata rename failure');
    await originalRename(source, destination);
    mediaRenamed = true;
  };
  syncBuiltinESMExports();
  try {
    const failed = await storeMedia(new File([bmff], 'route.mp4', { type: 'video/mp4' }), directory);
    assert.equal(mediaRenamed, true);
    assert.equal(failed.ok, false);
    if (!failed.ok) {
      assert.deepEqual([failed.error.code, failed.error.retryable], ['PROVIDER_UNAVAILABLE', true]);
      assert.match(failed.error.message, /partial upload was removed/);
    }
    assert.deepEqual(await readdir(directory), before);
  } finally {
    fs.promises.rename = originalRename;
    syncBuiltinESMExports();
  }

  const blocked = join(directory, 'not-a-directory');
  await writeFile(blocked, 'leave this file unchanged');
  const failed = await storeMedia(new File([bmff], 'route.mp4', { type: 'video/mp4' }), blocked);
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.deepEqual([failed.error.code, failed.error.retryable], ['PROVIDER_UNAVAILABLE', true]);
  assert.equal(await readFile(blocked, 'utf8'), 'leave this file unchanged');
  assert.deepEqual(await readdir(directory), [...before, 'not-a-directory'].sort());
} finally {
  if (oldDataFile === undefined) delete process.env.BREADCRUMB_DATA_FILE;
  else process.env.BREADCRUMB_DATA_FILE = oldDataFile;
  if (oldMediaDir === undefined) delete process.env.BREADCRUMB_MEDIA_DIR;
  else process.env.BREADCRUMB_MEDIA_DIR = oldMediaDir;
  await rm(directory, { recursive: true, force: true });
}
console.log('media checks passed (bounded streams, exact file field, synthetic headers, storage, metadata, write failure)');
