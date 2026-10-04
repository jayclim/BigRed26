import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, emptyState } from '../core/core.ts';
import { DEFAULT_GEMINI_MODEL, draftJsonSchema, extractDraft, providerJsonSchema, geminiGenerate, MAX_INLINE_REQUEST_BYTES, MAX_PROVIDER_RESPONSE_BYTES, type Generate } from './extraction.ts';
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
  // Metadata above the old inline limit is no longer rejected up front; the byte count check still applies.
  assert.equal(failure(await run(adapter), 'PROVIDER_UNAVAILABLE', true).message,
    'Stored video size does not match its metadata. Upload the video again.');
  await writeFile(metadataPath, JSON.stringify(metadata));
  assert.equal(fetches, 0);
  assert.equal(saves, 0);
  assert.deepEqual(state.routes, {});
  for (const phase of ['metadata', 'media']) {
    for (const mode of ['never', 'late']) {
      let reads = 0;
      let deadlineGenerates = 0;
      let deadlineSaves = 0;
      let resolveRead: ((value: string | Buffer) => void) | undefined;
      const injectedRead = ((...args: Parameters<typeof readFile>) => {
        reads++;
        if (phase === 'media' && args[0] === metadataPath) return readFile(...args);
        // Ignore the signal to reproduce a stalled filesystem operation.
        return new Promise<string | Buffer>((resolve) => {
          if (mode === 'late') resolveRead = resolve;
        });
      }) as typeof readFile;
      let guard: ReturnType<typeof setTimeout> | undefined;
      const watchdog = new Promise<never>((_resolve, reject) => {
        guard = setTimeout(() => reject(new Error(`${phase} ${mode} read exceeded the 150 ms deadline guard`)), 150);
      });
      try {
        const started = performance.now();
        const pending = extractDraft(mediaId, {
          directory, timeoutMs: 20, readFile: injectedRead,
          generate: async () => { deadlineGenerates++; return fixture; },
          core: { saveDraft: async (draft) => { deadlineSaves++; return { ok: true, value: draft }; } },
        });
        const error = failure(await Promise.race([pending, watchdog]), 'PROVIDER_UNAVAILABLE', true);
        const elapsedMs = performance.now() - started;
        assert.equal(error.message, 'Gemini extraction was cancelled or timed out. Retry the video.');
        assert.ok(elapsedMs < 150, `${phase} ${mode} read took ${elapsedMs.toFixed(1)} ms`);
        assert.equal(reads, phase === 'metadata' ? 1 : 2);
        assert.equal(deadlineGenerates, 0);
        assert.equal(deadlineSaves, 0);
        if (mode === 'late') {
          assert.ok(resolveRead);
          resolveRead(phase === 'metadata' ? JSON.stringify(metadata) : bytes);
          await new Promise<void>((resolve) => setImmediate(resolve));
          assert.equal(reads, phase === 'metadata' ? 1 : 2);
          assert.equal(deadlineGenerates, 0);
          assert.equal(deadlineSaves, 0);
        }
        console.log(`${phase} ${mode} read: ${elapsedMs.toFixed(1)} ms (timeoutMs=20; generate=0; save=0)`);
      } finally { clearTimeout(guard); }
    }
  }
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
    assert.deepEqual(body.response_format, { type: 'text', mime_type: 'application/json', schema: providerJsonSchema });
    return Response.json({ status: 'completed', steps: [
      { type: 'thought', content: [{ type: 'text', text: 'Do not parse thoughts' }] },
      { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(fixture) }] },
    ] });
  };
  assert.equal((await run(adapter)).ok, true);
  assert.equal(fetches, 1);
  // The provider schema drops array bounds (live HTTP 400) but keeps everything else; Zod enforces the bounds.
  assert.doesNotMatch(JSON.stringify(providerJsonSchema), /minItems|maxItems/);
  assert.match(JSON.stringify(draftJsonSchema), /minItems/);
  assert.equal(JSON.stringify(providerJsonSchema).replace(/,?"(min|max)Items":\d+,?/g, ''), JSON.stringify(draftJsonSchema).replace(/,?"(min|max)Items":\d+,?/g, ''));
  cases++;
  // Base64 overhead, not raw file size, decides inline vs Files API. 15 MB raw is about 20 MB encoded.
  // Small videos stay inline: no upload call was made above (fetches === 1).
  {
    const big = Buffer.alloc(Math.ceil(MAX_INLINE_REQUEST_BYTES * 0.75), 7);
    const justUnder = Buffer.alloc(Math.floor((MAX_INLINE_REQUEST_BYTES - 20_000) * 0.75), 7);
    const API = 'https://generativelanguage.googleapis.com';
    const UPLOAD_URL = `${API}/upload/v1beta/files?upload_id=fixture-session&upload_protocol=resumable`;
    const calls: { method: string; url: string; headers: Headers; bodyBytes: number; body?: string }[] = [];
    let script: { startStatus?: number; uploadUrl?: string | null; finalizeStatus?: number; finalizeState?: string;
      states?: string[]; pollStatus?: number; interactStatus?: number; deleteMode?: 'ok' | 'status' | 'throw' } = {};
    let polls = 0;
    const secret = 'secret-provider-body';
    const fakeFileApi = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = init?.body;
      calls.push({ method, url, headers, bodyBytes: typeof body === 'string' ? Buffer.byteLength(body) : (body as Uint8Array | undefined)?.byteLength ?? 0,
        body: typeof body === 'string' ? body : undefined });
      assert.ok(init?.signal instanceof AbortSignal);
      if (url === `${API}/upload/v1beta/files`) {
        if (script.startStatus) return new Response(secret, { status: script.startStatus });
        const h: Record<string, string> = {};
        if (script.uploadUrl !== null) h['x-goog-upload-url'] = script.uploadUrl ?? UPLOAD_URL;
        return new Response(null, { headers: h });
      }
      if (url.startsWith(`${API}/upload/`)) {
        if (script.finalizeStatus) return new Response(secret, { status: script.finalizeStatus });
        return Response.json({ file: { name: 'files/abc-123', uri: `${API}/v1beta/files/abc-123`, state: script.finalizeState ?? 'PROCESSING', mimeType: 'video/mp4' } });
      }
      if (url === `${API}/v1beta/files/abc-123` && method === 'GET') {
        if (script.pollStatus) return new Response(secret, { status: script.pollStatus });
        const states = script.states ?? ['ACTIVE'];
        const state = states[Math.min(polls++, states.length - 1)];
        return Response.json({ name: 'files/abc-123', uri: `${API}/v1beta/files/abc-123`, state });
      }
      if (url === `${API}/v1beta/files/abc-123` && method === 'DELETE') {
        if (script.deleteMode === 'throw') throw new Error(secret);
        return script.deleteMode === 'status' ? new Response(secret, { status: 500 }) : Response.json({});
      }
      if (url === `${API}/v1beta/interactions`) {
        if (script.interactStatus) return new Response(secret, { status: script.interactStatus });
        return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(fixture) }] }] });
      }
      throw new Error(`Unexpected fetch ${method} ${url}`);
    };
    const reset = (next: typeof script) => { script = next; calls.length = 0; polls = 0; };
    const fastAdapter = geminiGenerate({ enabled: '1', apiKey: 'fixture-key', filePollIntervalMs: 1, filePollLimitMs: 40 });
    const steps = () => calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    const bigVideo = { bytes: big, type: 'video/mp4' as const };
    const deleted = () => calls.some((c) => c.method === 'DELETE');
    globalThis.fetch = fakeFileApi as typeof fetch;

    // Just under the limit stays inline; 15 MB raw crosses it (next case).
    reset({});
    await fastAdapter({ bytes: justUnder, type: 'video/mp4' }, new AbortController().signal);
    assert.deepEqual(steps(), ['POST /v1beta/interactions']);
    assert.ok(calls[0].bodyBytes < MAX_INLINE_REQUEST_BYTES);
    cases++;

    // Happy path: start, finalize, poll PROCESSING -> ACTIVE, interactions by uri, delete.
    reset({ states: ['PROCESSING', 'PROCESSING', 'ACTIVE'] });
    const text = await fastAdapter(bigVideo, new AbortController().signal);
    assert.deepEqual(JSON.parse(String(text)), fixture);
    assert.deepEqual(steps(), [
      'POST /upload/v1beta/files', 'POST /upload/v1beta/files',
      'GET /v1beta/files/abc-123', 'GET /v1beta/files/abc-123', 'GET /v1beta/files/abc-123',
      'POST /v1beta/interactions', 'DELETE /v1beta/files/abc-123',
    ]);
    const [start, finalize, , , , interaction, del] = calls;
    assert.equal(start.headers.get('x-goog-api-key'), 'fixture-key');
    assert.equal(start.headers.get('x-goog-upload-protocol'), 'resumable');
    assert.equal(start.headers.get('x-goog-upload-command'), 'start');
    assert.equal(start.headers.get('x-goog-upload-header-content-length'), String(big.byteLength));
    assert.equal(start.headers.get('x-goog-upload-header-content-type'), 'video/mp4');
    assert.match(JSON.parse(start.body!).file.display_name, /^breadcrumb-/);
    assert.equal(finalize.url, UPLOAD_URL);
    assert.equal(finalize.headers.get('x-goog-upload-offset'), '0');
    assert.equal(finalize.headers.get('x-goog-upload-command'), 'upload, finalize');
    assert.equal(finalize.headers.get('x-goog-api-key'), null); // key is not sent to the session URL
    assert.equal(finalize.bodyBytes, big.byteLength);
    assert.equal(calls[2].headers.get('x-goog-api-key'), 'fixture-key');
    const interactionBody = JSON.parse(interaction.body!);
    assert.deepEqual(interactionBody.input[1], { type: 'video', uri: `${API}/v1beta/files/abc-123`, mime_type: 'video/mp4' });
    assert.equal(interactionBody.store, false);
    assert.deepEqual(interactionBody.response_format, { type: 'text', mime_type: 'application/json', schema: providerJsonSchema });
    assert.ok(interaction.bodyBytes < 100_000); // no inline base64
    assert.equal(del.headers.get('x-goog-api-key'), 'fixture-key');
    cases++;

    // End to end through extractDraft with a stored 15 MB file: draft saved, file deleted.
    {
      const bigId = randomUUID();
      await writeFile(join(directory, `${bigId}.json`), JSON.stringify({ ...metadata, id: bigId, size: big.byteLength }));
      await writeFile(join(directory, `${bigId}.mp4`), big);
      reset({ finalizeState: 'ACTIVE' });
      const saved = await extractDraft(bigId, { generate: fastAdapter, directory, core });
      assert.equal(saved.ok, true);
      assert.deepEqual(steps(), ['POST /upload/v1beta/files', 'POST /upload/v1beta/files', 'POST /v1beta/interactions', 'DELETE /v1beta/files/abc-123']);
      cases++;
    }

    // FAILED file state: specific non-retryable error, delete attempted, no interaction.
    reset({ states: ['PROCESSING', 'FAILED'] });
    await assert.rejects(fastAdapter(bigVideo, new AbortController().signal), /could not process this video file/);
    assert.ok(deleted() && !steps().includes('POST /v1beta/interactions'));
    reset({ finalizeState: 'FAILED' });
    const failed = failure(await extractDraft(mediaId, { generate: async (_v, sig) => fastAdapter(bigVideo, sig), directory, core }), 'INVALID_INPUT', false);
    assert.match(failed.message, /re-encoded video/);

    // Polling never reaches ACTIVE: bounded, retryable, delete attempted.
    reset({ states: ['PROCESSING'] });
    await assert.rejects(fastAdapter(bigVideo, new AbortController().signal), /still processing/);
    assert.ok(deleted());
    cases++;
    // Request deadline during polling (poll limit is longer than the deadline).
    {
      const slow = geminiGenerate({ enabled: '1', apiKey: 'fixture-key', filePollIntervalMs: 5, filePollLimitMs: 60_000 });
      reset({ states: ['PROCESSING'] });
      const keep = setInterval(() => {}, 100);
      try {
        const started = performance.now();
        const timedOut = failure(await extractDraft(mediaId, { generate: async (_v, sig) => slow(bigVideo, sig), directory, core, timeoutMs: 60 }), 'PROVIDER_UNAVAILABLE', true);
        assert.match(timedOut.message, /cancelled or timed out/);
        assert.ok(performance.now() - started < 1000);
        await new Promise((r) => setTimeout(r, 30)); // cleanup delete runs after the deadline result
        assert.ok(deleted());
        const pollsAtTimeout = calls.filter((c) => c.method === 'GET').length;
        await new Promise((r) => setTimeout(r, 30));
        assert.equal(calls.filter((c) => c.method === 'GET').length, pollsAtTimeout); // polling stopped
      } finally { clearInterval(keep); }
    }

    // HTTP errors map to sanitized specific errors; nothing is echoed; delete only when a file exists.
    for (const [stage, config, code, retryable, pattern] of [
      ['start 400', { startStatus: 400 }, 'INVALID_INPUT', false, /upload start \(HTTP 400\)/],
      ['start 403', { startStatus: 403 }, 'PROVIDER_UNAVAILABLE', false, /HTTP 403\)\. Check the API key/],
      ['start 429', { startStatus: 429 }, 'PROVIDER_UNAVAILABLE', true, /HTTP 429/],
      ['start 503', { startStatus: 503 }, 'PROVIDER_UNAVAILABLE', true, /HTTP 503/],
      ['finalize 413', { finalizeStatus: 413 }, 'INVALID_INPUT', false, /during upload \(HTTP 413\)/],
      ['finalize 500', { finalizeStatus: 500 }, 'PROVIDER_UNAVAILABLE', true, /HTTP 500/],
      ['no session url', { uploadUrl: null }, 'PROVIDER_UNAVAILABLE', true, /did not accept the video upload/],
      ['foreign session url', { uploadUrl: 'https://evil.example/upload' }, 'PROVIDER_UNAVAILABLE', true, /did not accept the video upload/],
    ] as const) {
      reset(config);
      const error = failure(await extractDraft(mediaId, { generate: async (_v, sig) => fastAdapter(bigVideo, sig), directory, core }), code, retryable);
      assert.match(error.message, pattern, stage);
      assert.doesNotMatch(error.message, /secret/);
      assert.equal(deleted(), false, stage);
      assert.ok(calls.every((c) => !c.url.startsWith('https://evil.example')), stage);
    }
    // Poll HTTP error and interactions error both clean up the uploaded file.
    reset({ pollStatus: 500 });
    assert.match(failure(await extractDraft(mediaId, { generate: async (_v, sig) => fastAdapter(bigVideo, sig), directory, core }), 'PROVIDER_UNAVAILABLE', true).message, /processing check failed \(HTTP 500\)/);
    assert.ok(deleted());
    reset({ finalizeState: 'ACTIVE', interactStatus: 429 });
    const interactionError = failure(await extractDraft(mediaId, { generate: async (_v, sig) => fastAdapter(bigVideo, sig), directory, core }), 'PROVIDER_UNAVAILABLE', true);
    assert.match(interactionError.message, /HTTP 429/);
    assert.doesNotMatch(interactionError.message, /secret/);
    assert.ok(deleted());

    // A failing delete never fails extraction.
    for (const deleteMode of ['status', 'throw'] as const) {
      reset({ finalizeState: 'ACTIVE', deleteMode });
      assert.deepEqual(JSON.parse(String(await fastAdapter(bigVideo, new AbortController().signal))), fixture);
      assert.ok(deleted());
    }
    cases++;
    globalThis.fetch = async () => { fetches++; throw new Error('Network is forbidden in checks'); };
  }
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
