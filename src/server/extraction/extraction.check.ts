import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, emptyState } from '../core/core.ts';
import { DEFAULT_GEMINI_MODEL, draftJsonSchema, extractDraft, geminiGenerate, MAX_INLINE_REQUEST_BYTES, MAX_PROVIDER_RESPONSE_BYTES, type Generate } from './extraction.ts';
import type { Result, Route } from '../../../contracts/contracts.ts';

const directory = await mkdtemp(join(tmpdir(), 'breadcrumb-extraction-'));
const mediaId = randomUUID();
const bytes = Buffer.from([0, 0, 0, 16, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const fixture = {
  name: 'Room route', startDescription: 'Entrance', destinationLabel: 'B214',
  checkpoints: [
    { label: 'Entrance', videoTimeMs: 0, identifyingEvidence: ['  EXIT / Salida  '],
      approachDescription: 'Face the entrance', instruction: { en: 'Go forward.', es: 'Sigue recto.' },
      direction: 'forward', action: null, isDestination: false },
    { label: 'B214', videoTimeMs: 1200, identifyingEvidence: ['B214'],
      approachDescription: 'Face the room sign', instruction: { en: 'You have arrived.', es: 'Has llegado.' },
      direction: null, action: null, isDestination: true },
  ],
};
const originalFetch = globalThis.fetch;
let cases = 0;
function failure(result: Result<Route>, code = 'PROVIDER_UNAVAILABLE', retryable?: boolean) {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected failure');
  assert.equal(result.error.code, code);
  if (retryable !== undefined) assert.equal(result.error.retryable, retryable);
  cases++;
  return result.error;
}
try {
  const metadata = {
    id: mediaId, originalName: 'synthetic.mp4', type: 'video/mp4', size: bytes.length, uploadedAt: new Date().toISOString(),
  };
  const metadataPath = join(directory, `${mediaId}.json`);
  await writeFile(metadataPath, JSON.stringify(metadata));
  await writeFile(join(directory, `${mediaId}.mp4`), bytes);
  const state = emptyState();
  const memoryCore = createCore({ state, recognizers: {} });
  let saves = 0;
  const core = { ...memoryCore, saveDraft: async (draft: Route) => {
    saves++;
    return memoryCore.saveDraft(draft);
  } };
  let generated = 0;
  const generate: Generate = async (video, signal) => {
    generated++;
    assert.deepEqual(video.bytes, bytes);
    assert.equal(video.type, 'video/mp4');
    assert.equal(signal.aborted, false);
    return JSON.stringify(fixture);
  };
  const run = (provider: Generate = generate, extra: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
    extractDraft(mediaId, { generate: provider, directory, core, ...extra });
  failure(await extractDraft('../unsafe', { generate, directory, core }), 'INVALID_INPUT', false);
  failure(await extractDraft(randomUUID(), { generate, directory, core }), 'NOT_FOUND', false);
  assert.equal(generated, 0);
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error('Network is forbidden in checks'); };
  for (const config of [{}, { apiKey: 'fixture-key' }, { enabled: '1' }]) {
    assert.match(failure(await run(geminiGenerate(config))).message, /not enabled/);
  }
  assert.equal(fetches, 0);
  const adapter = geminiGenerate({ enabled: '1', apiKey: 'fixture-key' });
  await writeFile(metadataPath, JSON.stringify({ ...metadata, size: bytes.length + 1 }));
  assert.equal(failure(await run(adapter), 'PROVIDER_UNAVAILABLE', true).message,
    'Stored video size does not match its metadata. Upload the video again.');
  await writeFile(metadataPath, JSON.stringify({ ...metadata, size: MAX_INLINE_REQUEST_BYTES }));
  assert.match(failure(await run(adapter), 'INVALID_INPUT', false).message, /20 MB/);
  await writeFile(metadataPath, JSON.stringify(metadata));
  assert.equal(fetches, 0);
  assert.equal(saves, 0);
  assert.deepEqual(state.routes, {});
  failure(await run(async () => { throw new Error('secret-provider-body'); }), 'PROVIDER_UNAVAILABLE', true);
  const keepAlive = setInterval(() => {}, 100); // AbortSignal.timeout uses an unref'ed timer
  try {
    const timeout = failure(await run(async () => new Promise(() => {}), { timeoutMs: 10 }), 'PROVIDER_UNAVAILABLE', true);
    assert.match(timeout.message, /cancelled or timed out/);
    const controller = new AbortController();
    const aborted = run(async () => { controller.abort(); return fixture; }, { signal: controller.signal });
    failure(await aborted, 'PROVIDER_UNAVAILABLE', true);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();
    failure(await run(generate, { signal: alreadyAborted.signal }), 'PROVIDER_UNAVAILABLE', true);
  } finally { clearInterval(keepAlive); }
  failure(await run(async () => '{bad json'), 'PROVIDER_UNAVAILABLE', true);
  failure(await run(async () => ({ ...fixture, name: 42 })), 'PROVIDER_UNAVAILABLE', true);
  failure(await run(async () => ({ ...fixture, checkpoints: fixture.checkpoints.map((cp) => ({ ...cp, isDestination: true })) })), 'PROVIDER_UNAVAILABLE', true);
  failure(await run(async () => ({ ...fixture, checkpoints: fixture.checkpoints.map((cp) => ({ ...cp, isDestination: false })) })), 'PROVIDER_UNAVAILABLE', true);
  failure(await run(async () => ({ ...fixture, checkpoints: [...fixture.checkpoints].reverse() })), 'PROVIDER_UNAVAILABLE', true);
  assert.deepEqual(state.routes, {}); // every failure leaves storage unchanged
  const result = await run();
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected draft');
  const route = result.value;
  assert.deepEqual([route.status, route.version, route.sourceVideoId], ['draft', 1, mediaId]);
  assert.notEqual(route.id, mediaId);
  assert.deepEqual((await core.getRoute(route.id)), result);
  assert.ok(route.checkpoints.every((cp) => !Object.hasOwn(cp, 'action')));
  assert.deepEqual(route.checkpoints[0].identifyingEvidence, ['  EXIT / Salida  ']);
  assert.deepEqual(route.checkpoints.map((cp) => cp.order), [0, 1]);
  assert.deepEqual(route.checkpoints[1].referenceViews, [{ mediaId, videoTimeMs: 1200, role: 'destination' }]);
  failure(await core.approveRoute(route.id, 1, []), 'NOT_APPROVED', false);
  assert.equal((await core.getRoute(route.id)).ok, true);
  const action = {
    kind: 'door', target: '  B214  ', side: 'right', targetFloor: null,
    steps: [{ en: 'Open B214.', es: 'Abre B214.' }], completion: { en: 'Go through.', es: 'Entra.' },
  };
  const withAction = await run(async () => ({ ...fixture, checkpoints: [
    { ...fixture.checkpoints[0], action }, fixture.checkpoints[1],
  ] }));
  assert.equal(withAction.ok, true);
  if (withAction.ok) {
    assert.deepEqual(withAction.value.checkpoints[0].action, action);
    assert.notEqual(withAction.value.id, route.id);
  }
  // REST adapter checks use a local fetch fixture only; no Google call.
  globalThis.fetch = async (url, init) => {
    fetches++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'fixture-key');
    assert.equal(init?.method, 'POST');
    assert.ok(init?.signal instanceof AbortSignal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, DEFAULT_GEMINI_MODEL);
    assert.equal(body.store, false);
    assert.deepEqual(body.input[1], { type: 'video', mime_type: 'video/mp4', data: bytes.toString('base64') });
    assert.deepEqual(body.response_format, { type: 'text', mime_type: 'application/json', schema: draftJsonSchema });
    return Response.json({ status: 'completed', steps: [
      { type: 'thought', content: [{ type: 'text', text: 'Do not parse thoughts' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(fixture) }] },
    ] });
  };
  assert.equal((await run(adapter)).ok, true);
  assert.equal(fetches, 1);
  // Base64 overhead, not raw file size, determines the inline request limit.
  await assert.rejects(adapter({ bytes: Buffer.alloc(Math.ceil(MAX_INLINE_REQUEST_BYTES * 0.75)), type: 'video/mp4' }, new AbortController().signal), /20 MB/);
  assert.equal(fetches, 1);
  const savesBeforeResponseFailures = saves;
  const routesBeforeResponseFailures = structuredClone(state.routes);
  // Valid JSON with extra padding must be rejected before the full envelope is read or parsed.
  const paddedEnvelope = Buffer.from(JSON.stringify({ status: 'completed', steps: [
    { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(fixture) }] },
  ], padding: `secret-provider-body${' '.repeat(MAX_PROVIDER_RESPONSE_BYTES * 2)}` }));
  let offset = 0;
  let oversizedCancelled = 0;
  const oversizedBody = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === paddedEnvelope.byteLength) return controller.close();
      const end = Math.min(offset + 64 * 1024, paddedEnvelope.byteLength);
      controller.enqueue(paddedEnvelope.subarray(offset, end));
      offset = end;
    },
    cancel() {
      oversizedCancelled++;
      return new Promise<void>(() => {}); // Source cleanup must not delay rejection.
    },
  });
  globalThis.fetch = async () => { fetches++; return new Response(oversizedBody); };
  const oversizedError = failure(await run(adapter), 'PROVIDER_UNAVAILABLE', true);
  assert.equal(oversizedError.message, 'Gemini did not return a completed extraction. Retry the video.');
  assert.doesNotMatch(oversizedError.message, /secret/);
  assert.equal(oversizedCancelled, 1);
  assert.equal(oversizedBody.locked, false);
  assert.ok(offset < paddedEnvelope.byteLength);
  assert.equal(saves, savesBeforeResponseFailures);
  assert.deepEqual(state.routes, routesBeforeResponseFailures);
  for (const body of [null, 'secret-provider-body: invalid JSON']) {
    globalThis.fetch = async () => { fetches++; return new Response(body); };
    assert.equal(failure(await run(adapter), 'PROVIDER_UNAVAILABLE', true).message, oversizedError.message);
  }
  for (const mode of ['abort', 'timeout']) {
    const controller = new AbortController();
    let readStarted!: () => void;
    const reading = new Promise<void>((resolve) => { readStarted = resolve; });
    let firstChunk = true;
    let stalledCancelled = 0;
    const stalledBody = new ReadableStream<Uint8Array>({
      pull(stream) {
        if (firstChunk) {
          firstChunk = false;
          stream.enqueue(new TextEncoder().encode('{"status":'));
        } else readStarted(); // Leave the next read pending.
      },
      cancel() {
        stalledCancelled++;
        return new Promise<void>(() => {});
      },
    }, { highWaterMark: 0 });
    globalThis.fetch = async () => { fetches++; return new Response(stalledBody); };
    let guard: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<never>((_resolve, reject) => {
      guard = setTimeout(() => reject(new Error(`${mode} did not stop the body read promptly`)), 1000);
    });
    try {
      const pending = run(adapter, { signal: controller.signal, timeoutMs: mode === 'timeout' ? 100 : 1000 });
      await Promise.race([reading, watchdog]);
      if (mode === 'abort') controller.abort();
      const cancelled = failure(await Promise.race([pending, watchdog]), 'PROVIDER_UNAVAILABLE', true);
      assert.match(cancelled.message, /cancelled or timed out/);
      assert.equal(stalledCancelled, 1);
      assert.equal(stalledBody.locked, false);
      assert.equal(saves, savesBeforeResponseFailures);
      assert.deepEqual(state.routes, routesBeforeResponseFailures);
    } finally { clearTimeout(guard); }
  }
  assert.equal(saves, savesBeforeResponseFailures);
  assert.deepEqual(state.routes, routesBeforeResponseFailures);
  globalThis.fetch = async () => new Response('secret-provider-body', { status: 429 });
  const providerError = failure(await run(adapter), 'PROVIDER_UNAVAILABLE', true);
  assert.match(providerError.message, /HTTP 429/);
  assert.doesNotMatch(providerError.message, /secret/);
  cases += 5;
  console.log(`extraction checks passed (${cases} cases; no network calls)`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
