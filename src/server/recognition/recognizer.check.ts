import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Result, Route, FrameRequest } from '../../../contracts/contracts.ts';
import { createCore, emptyState } from '../core/core.ts';
import { saveFrame } from '../frames/frames.ts';
import { createRecognizer, type RecognitionProvider } from './recognizer.ts';
import { geminiRecognitionProvider, liveRecognitionEnabled } from './gemini.ts';
import { MAX_PROVIDER_RESPONSE_BYTES } from '../extraction/extraction.ts';

const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Real fetch is forbidden.'); };
const dir = await mkdtemp(join(tmpdir(), 'recognition-'));
const value = <T>(r: Result<T>): T => { assert.equal(r.ok, true, JSON.stringify(r)); if (!r.ok) throw new Error('Failed'); return r.value; };
const error = (r: Result<unknown>, code: string, retryable = true) => {
  assert.equal(r.ok, false); if (r.ok) throw new Error('Expected failure');
  assert.equal(r.error.code, code); assert.equal(r.error.retryable, retryable);
  assert.ok(!r.error.message.includes('SECRET')); assert.ok(!r.error.message.includes('BODY_MARKER'));
};
const fixture = JSON.parse(await readFile(new URL('../../../contracts/fixture.v1.json', import.meta.url), 'utf8')).route as Route;
const actions = JSON.parse(await readFile(new URL('../../../contracts/fixture.actions.v1.json', import.meta.url), 'utf8')).route as Route;
const jpeg = new Uint8Array([255, 216, 255, 1, 2]);
const mediaId = value(await saveFrame(jpeg, dir)).mediaId;
const observation = (checkpointId: string | null, approachConfirmed = true, evidence = ['Example entrance sign']) => ({ checkpointId, approachConfirmed, evidence });
async function setup(provider: RecognitionProvider, route = fixture, timeoutMs = 1000) {
  const core = createCore({ state: emptyState(), recognizers: { live: createRecognizer({ provider, directory: dir, timeoutMs }) } });
  const saved = value(await core.saveDraft({ ...structuredClone(route), status: 'draft' }));
  const approved = value(await core.approveRoute(saved.id, saved.version, saved.checkpoints.map((cp) => cp.id)));
  const session = value(await core.startSession(saved.id, 'es', 'live'));
  const request = async (id = mediaId): Promise<FrameRequest> => ({ sessionId: session.id,
    ...value(await core.reserveFrameSequence(session.id)), capturedAt: new Date().toISOString(), mediaId: id });
  return { core, session, approved, request, match: async (id = mediaId) => core.matchFrame(await request(id)) };
}
try {
  let output: unknown = observation('entrance');
  let calls = 0;
  const s = await setup(async (input) => {
    calls++; assert.deepEqual([...input.frame], [...jpeg]); assert.equal(input.candidates.length, fixture.checkpoints.length);
    assert.ok(!JSON.stringify(input.candidates).includes('instruction'));
    assert.ok(!JSON.stringify(input.candidates).includes('completion')); return output;
  });
  error(await s.core.matchFrame({ ...await s.request(), sequence: 999 }), 'INVALID_INPUT', false);
  const guiding = value(await s.match());
  assert.equal(guiding.state, 'guiding'); assert.equal(guiding.direction, s.approved.checkpoints[0].direction);
  assert.equal(guiding.text, s.approved.checkpoints[0].instruction.es); assert.equal(guiding.routeVersion, s.session.routeVersion);
  const v2 = value(await s.core.saveDraft({ ...structuredClone(fixture), name: 'New draft', version: 2, status: 'draft' }));
  value(await s.core.approveRoute(v2.id, v2.version, v2.checkpoints.map((cp) => cp.id)));
  assert.equal(value(await s.core.getSession(s.session.id)).routeVersion, 1);
  for (const invalid of ['{', { ...observation('entrance'), extra: true }, { checkpointId: 'entrance', evidence: [] },
    observation('entrance', true, Array(21).fill('x')), observation('entrance', true, ['x'.repeat(201)]), observation('nonexistent')]) {
    output = invalid; const previous = value(await s.core.currentGuidance(s.session.id));
    error(await s.match(), 'PROVIDER_UNAVAILABLE'); assert.deepEqual(value(await s.core.currentGuidance(s.session.id)), previous);
  }
  output = observation('entrance', false);
  const reorient = value(await s.match()); assert.equal(reorient.state, 'reorient'); assert.equal(reorient.direction, null); assert.equal(reorient.approachConfirmed, false);
  output = observation(null); assert.equal(value(await s.match()).state, 'uncertain');
  assert.equal(value(await s.core.getSession(s.session.id)).lastConfirmedCheckpointId, 'entrance');
  const far = await setup(async () => observation('destination')); const uncertain = value(await far.match());
  assert.equal(uncertain.state, 'uncertain'); assert.equal(uncertain.direction, null);
  const beforeMissing = calls;
  error(await s.match(`frame_${randomUUID()}`), 'NOT_FOUND', false); error(await s.match('../unsafe'), 'INVALID_INPUT', false); assert.equal(calls, beforeMissing);
  console.log('PASS approved guidance, pinned version, validation, approach, unknown, window and media');

  let release!: (o: unknown) => void;
  let entered!: () => void;
  let waiting = new Promise<void>((resolve) => { entered = resolve; });
  let count = 0;
  const slow = await setup(async () => { count++; entered(); return new Promise((resolve) => { release = resolve; }); });
  const pending = slow.match(); await waiting;
  error(await slow.match(), 'RATE_LIMITED'); assert.equal(count, 1);
  release(observation('entrance')); value(await pending);
  waiting = new Promise<void>((resolve) => { entered = resolve; });
  const again = slow.match(); await waiting; release(observation('entrance')); value(await again);
  // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const timed = await setup(async () => new Promise(() => {}), fixture, 25);
    const start = performance.now(); error(await timed.match(), 'PROVIDER_UNAVAILABLE'); assert.ok(performance.now() - start < 500);
    const readTimed = createRecognizer({ provider: async () => { throw new Error('Must not run'); },
      readFrame: async () => new Promise(() => {}), timeoutMs: 25 });
    error(await readTimed(fixture, await timed.request()), 'PROVIDER_UNAVAILABLE');
  } finally { clearInterval(keepAlive); }
  console.log('PASS single flight, release and bounded read/provider timeout');

  waiting = new Promise<void>((resolve) => { entered = resolve; });
  let first = true;
  const stale = await setup(async (input) => {
    assert.deepEqual(input.candidates[0].action, { target: 'B214', kind: 'door', side: 'left', targetFloor: null });
    if (first) { first = false; return observation('door-b214', true, ['B214']); }
    entered(); return new Promise((resolve) => { release = resolve; });
  }, actions);
  value(await stale.match());
  // The first check makes the action active. The next two reserved sequences exercise the stale commit guard.
  const oldRequest = await stale.request(); const old = stale.core.matchFrame(oldRequest); await waiting;
  const manual = value(await stale.core.completeAction(stale.session.id, { ...value(await stale.core.reserveFrameSequence(stale.session.id)), checkpointId: 'door-b214' }));
  assert.equal(manual.direction, null);
  release(observation('door-b214', true, ['B214'])); error(await old, 'STALE_FRAME');
  assert.equal(value(await stale.core.getSession(stale.session.id)).lastConfirmedCheckpointId, 'elevator');
  assert.equal(stale.core.state.events.filter((e) => e.kind === 'manual_advance').length, 1);
  console.log('PASS explicit manual completion and stale response rejection');

  let nextId = 'entrance';
  const arrival = await setup(async () => observation(nextId));
  value(await arrival.match()); nextId = 'mural'; value(await arrival.match());
  const before = structuredClone(arrival.core.state);
  await new Promise((resolve) => setTimeout(resolve, 30)); assert.deepEqual(arrival.core.state, before);
  nextId = 'destination'; assert.equal(value(await arrival.match()).state, 'arrived');
  console.log('PASS arrival from destination observation and no timer progress');

  let fetchCalls = 0;
  const config = { enabled: '1', apiKey: 'SECRET', model: 'fake-model' };
  assert.equal(liveRecognitionEnabled({ enabled: '1' }), false);
  const disabled = await setup(geminiRecognitionProvider({}, async () => { fetchCalls++; throw new Error('Disabled fetch'); }));
  error(await disabled.match(), 'PROVIDER_UNAVAILABLE', false); assert.equal(fetchCalls, 0);
  let response = () => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(observation('entrance')) }] }] }));
  const fakeFetch: typeof fetch = async (url, init) => {
    fetchCalls++; assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(init?.method, 'POST'); assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'SECRET');
    assert.ok(!String(url).includes('SECRET')); assert.ok(!String(init?.body).includes('SECRET'));
    const body = JSON.parse(String(init?.body)); assert.equal(body.store, false); assert.equal(body.model, 'fake-model');
    assert.deepEqual(body.input[1], { type: 'image', data: Buffer.from(jpeg).toString('base64'), mime_type: 'image/jpeg' });
    assert.ok(body.response_format.schema); assert.ok(init?.signal); return response();
  };
  const transport = await setup(geminiRecognitionProvider(config, fakeFetch));
  assert.equal(value(await transport.match()).state, 'guiding');
  for (const [status, code] of [[429, 'RATE_LIMITED'], [500, 'PROVIDER_UNAVAILABLE']] as const) {
    let cancellations = 0;
    response = () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_PROVIDER_RESPONSE_BYTES + 1)); },
      cancel() { cancellations++; return new Promise<void>(() => {}); },
    }), { status });
    error(await transport.match(), code); assert.equal(cancellations, 1);
  }
  for (const [makeResponse, code] of [
    [() => new Response('SECRET BODY_MARKER', { status: 429 }), 'RATE_LIMITED'],
    [() => new Response('SECRET BODY_MARKER', { status: 500 }), 'PROVIDER_UNAVAILABLE'],
    [() => new Response('x'.repeat(MAX_PROVIDER_RESPONSE_BYTES + 1)), 'PROVIDER_UNAVAILABLE'],
    [() => new Response(JSON.stringify({ status: 'in_progress', steps: [] })), 'PROVIDER_UNAVAILABLE'],
    [() => new Response('SECRET BODY_MARKER'), 'PROVIDER_UNAVAILABLE'],
  ] as const) { response = makeResponse; error(await transport.match(), code); }
  const absent = createCore({ state: emptyState(), recognizers: { mock: async () => ({ ok: true, value: { kind: 'unknown', evidence: [] } }) } });
  const draft = value(await absent.saveDraft({ ...structuredClone(fixture), status: 'draft' }));
  value(await absent.approveRoute(draft.id, draft.version, draft.checkpoints.map((cp) => cp.id)));
  error(await absent.startSession(draft.id, 'en', 'live'), 'PROVIDER_UNAVAILABLE', false);
  error(await absent.startSession(draft.id, 'en', 'replay'), 'PROVIDER_UNAVAILABLE', false);
  console.log('PASS fake Gemini transport, safe errors, disabled config and absent live/replay');
} finally {
  globalThis.fetch = realFetch;
  await rm(dir, { recursive: true, force: true });
}
