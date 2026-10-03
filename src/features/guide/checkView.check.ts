import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Guidance, Result, Route } from '../../../contracts/contracts.ts';
import { createCore, emptyState, type Observation } from '../../server/core/core.ts';
import { checkView } from './checkView.ts';
import { reconcileGuide } from './reconcileGuide.ts';
const fixture = JSON.parse(readFileSync('contracts/fixture.v1.json', 'utf8')).route as Route;
const actions = JSON.parse(readFileSync('contracts/fixture.actions.v1.json', 'utf8')).route as Route;
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail: Result<never> = { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Synthetic failure', retryable: true } };
const value = <T>(r: Result<T>): T => { assert(r.ok); return r.value; };
let hold: (() => void) | undefined;
let entered: (() => void) | undefined;
const core = createCore({ state: emptyState(), recognizers: { live: async (route, req) => {
  if (req.mediaId === 'pending') { entered?.(); await new Promise<void>((r) => { hold = r; }); }
  if (req.mediaId === 'failure') return fail;
  if (req.mediaId === 'unknown') return ok<Observation>({ kind: 'unknown', evidence: [] });
  const cp = route.checkpoints[0];
  return ok<Observation>({ kind: 'checkpoint', checkpointId: cp.id, approachConfirmed: req.mediaId !== 'wrong', evidence: [cp.action?.target ?? cp.identifyingEvidence[0]] });
} } });
for (const route of [fixture, actions]) {
  value(await core.saveDraft({ ...route, status: 'draft' }));
  value(await core.approveRoute(route.id, 1, route.checkpoints.map((c) => c.id)));
}
const session = value(await core.startSession(fixture.id, 'en', 'live'));
const flight = { current: false };
let current = true;
let mediaId = 'target';
const run = (upload = async () => ok({ mediaId }), lock = flight) => checkView({ core, sessionId: session.id, upload,
  frame: async () => new Blob(['synthetic']), capturedAt: new Date().toISOString(), isCurrent: () => current, flight: lock });
let result = await run(); assert(result?.ok);
assert.equal(result.value.state, 'guiding'); assert.equal(result.value.direction, fixture.checkpoints[0].direction);
const before = value(await core.getSession(session.id));
const guidance = value(await core.currentGuidance(session.id));
result = await run(async () => fail); assert(result && !result.ok);
assert.deepEqual(value(await core.getSession(session.id)), before);
assert.equal(core.state.sessions[session.id].reservedSequence, before.lastAcceptedSequence);
mediaId = 'failure'; result = await run(); assert(result && !result.ok);
assert.deepEqual(value(await core.currentGuidance(session.id)), guidance);
console.log('PASS target direction; upload and recognizer failures preserve guidance');
mediaId = 'unknown'; result = await run(); assert(result?.ok); assert.equal(result.value.state, 'uncertain'); assert.equal(result.value.direction, null);
mediaId = 'wrong'; result = await run(); assert(result?.ok); assert.equal(result.value.state, 'reorient'); assert.equal(result.value.direction, null);
console.log('PASS unknown and wrong approach suppress arrows');
mediaId = 'pending';
let ready = new Promise<void>((r) => { entered = r; });
const pending = run(); await ready;
const reserved = core.state.sessions[session.id].reservedSequence;
assert.equal(await run(), null); assert.equal(core.state.sessions[session.id].reservedSequence, reserved);
current = false; hold!(); assert.equal(await pending, null); current = true;
console.log('PASS one flight, no extra sequence, unmount drops result');
// A separate client can submit a newer sequence while the old request awaits recognition.
ready = new Promise<void>((r) => { entered = r; });
const older = run(); await ready;
mediaId = 'target'; const newer = await run(undefined, { current: false }); assert(newer?.ok);
hold!(); assert.equal(await older, null);
assert.equal(reconcileGuide(value(await core.getSession(session.id)), newer.value, newer.value.sequence + 1), null);
console.log('PASS core STALE_FRAME is ignored; old client sequence is ignored');
const position = value(await core.getSession(session.id));
value(await core.setLocale(session.id, 'es'));
const localized = value(await core.currentGuidance(session.id)); assert(localized);
assert.equal(localized.locale, 'es'); assert.equal(localized.sequence, position.lastAcceptedSequence);
assert.equal(value(await core.getSession(session.id)).lastConfirmedCheckpointId, position.lastConfirmedCheckpointId);
value(await core.saveDraft({ ...fixture, version: 2, status: 'draft' }));
value(await core.approveRoute(fixture.id, 2, fixture.checkpoints.map((c) => c.id)));
result = await run(); assert(result?.ok); assert.equal(result.value.routeVersion, 1);
console.log('PASS locale preserves position and sequence; session remains pinned to v1');
const actionSession = value(await core.startSession(actions.id, 'en', 'live'));
const seq = value(await core.reserveFrameSequence(actionSession.id));
const active = value(await core.matchFrame({ sessionId: actionSession.id, ...seq, capturedAt: new Date().toISOString(), mediaId: 'target' }));
assert.equal(active.state, 'guiding');
const completion = value(await core.completeAction(actionSession.id, { ...value(await core.reserveFrameSequence(actionSession.id)), checkpointId: actions.checkpoints[0].id }));
assert.equal(completion.direction, null); assert.notEqual(completion.state, 'guiding'); assert.match(completion.evidence.join(' '), /manual/i);
console.log('PASS explicit manual completion has no arrow');

// Capture waits must hold the same flight lock before upload or sequence allocation.
let finishCapture!: (blob: Blob) => void;
const captureFlight = { current: false };
const captureReserved = core.state.sessions[session.id].reservedSequence;
const capturing = checkView({ core, sessionId: session.id, upload: async () => ok({ mediaId: 'target' }),
  frame: () => new Promise<Blob>((r) => { finishCapture = r; }), capturedAt: new Date().toISOString(),
  isCurrent: () => current, flight: captureFlight });
assert.equal(await run(undefined, captureFlight), null);
assert.equal(core.state.sessions[session.id].reservedSequence, captureReserved);
current = false; finishCapture(new Blob(['synthetic'])); assert.equal(await capturing, null); current = true;
assert.equal(core.state.sessions[session.id].reservedSequence, captureReserved);
console.log('PASS capture holds shared flight lock; unmounted capture allocates no sequence');

const { captureFrame, MAX_FRAME_BYTES } = await import('./frameCapture.ts');
const savedDocument = globalThis.document;
let encoded: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' });
let encodings = 0;
const canvas = {
  width: 0, height: 0, getContext: () => ({ drawImage() {} }),
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number) {
    assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.7); encodings++; callback(encoded);
  },
};
try {
  globalThis.document = { createElement: () => canvas } as unknown as Document;
  await captureFrame({ videoWidth: 1920, videoHeight: 1080 } as HTMLVideoElement);
  assert.deepEqual([canvas.width, canvas.height, encodings], [640, 360, 1]);
  await captureFrame({ videoWidth: 480, videoHeight: 960 } as HTMLVideoElement);
  assert.deepEqual([canvas.width, canvas.height], [320, 640]);
  await assert.rejects(captureFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement));
  encoded = new Blob([new Uint8Array(MAX_FRAME_BYTES + 1)], { type: 'image/jpeg' });
  await assert.rejects(captureFrame({ videoWidth: 1, videoHeight: 1 } as HTMLVideoElement));
  encoded = null; await assert.rejects(captureFrame({ videoWidth: 1, videoHeight: 1 } as HTMLVideoElement));
  console.log('PASS capture scales landscape/portrait to 640, encodes once, rejects no frame and oversized/null blobs');
} finally { globalThis.document = savedDocument; }
