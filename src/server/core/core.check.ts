// Runnable core check: `npm run check`. Exercises approval, unknown scene, reorientation,
// arrival, stale ordering, provider failure, locale preservation and safe store loading against the kit fixture.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FrameRequest, Route } from '../../../contracts/contracts.ts';
import { createCore, emptyState, type Recognizer } from './core.ts';
import { loadState, persistState } from './store.ts';
import { mockRecognizer } from '../../shared/mockScenes.ts';

const fixture = JSON.parse(readFileSync(new URL('../../../contracts/fixture.v1.json', import.meta.url), 'utf8'));
const draft: Route = { ...fixture.route, status: 'draft' };

let hold: { mediaId: string; until: Promise<void> } | null = null; // pauses one scene to race two frames
const slowMock: Recognizer = async (route, req) => {
  if (hold?.mediaId === req.mediaId) await hold.until;
  return mockRecognizer(route, req);
};
const core = createCore({ recognizers: { mock: slowMock } });

const must = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }): T => {
  assert.ok(r.ok, `expected ok, got ${JSON.stringify(r)}`);
  return r.value;
};
const errCode = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? 'OK' : r.error!.code);

// Approval: drafts can't navigate, review is explicit, approved versions are immutable.
must(await core.saveDraft(draft));
const ids = draft.checkpoints.map((c) => c.id);
assert.equal(errCode(await core.startSession(draft.id, 'en', 'mock')), 'NOT_APPROVED');
assert.equal(errCode(await core.approveRoute(draft.id, 1, ids.slice(0, 2))), 'NOT_APPROVED');
assert.equal(must(await core.approveRoute(draft.id, 1, ids)).status, 'approved');
assert.equal(errCode(await core.saveDraft({ ...draft, name: 'edited' })), 'STALE_VERSION');
assert.equal(errCode(await core.startSession(draft.id, 'en', 'live')), 'PROVIDER_UNAVAILABLE'); // no silent fallback

const session = must(await core.startSession(draft.id, 'en', 'mock'));
const frame = async (mediaId: string, sequence?: number) => {
  const seq = sequence ?? must(await core.reserveFrameSequence(session.id)).sequence;
  const req: FrameRequest = { sessionId: session.id, routeVersion: 1, sequence: seq, capturedAt: new Date().toISOString(), mediaId };
  return core.matchFrame(req);
};

// Unknown scene: uncertain, no arrow, no progress.
let g = must(await frame('mock:unrelated'));
assert.equal(g.state, 'uncertain'); assert.equal(g.direction, null);

// Skipping ahead to a non-nearby checkpoint is refused.
g = must(await frame('mock:destination:approach'));
assert.equal(g.state, 'uncertain'); assert.equal(g.direction, null);

// Reorientation: location recognized, approach not confirmed => no arrow, no progress.
g = must(await frame('mock:entrance:unknown-approach'));
assert.equal(g.state, 'reorient'); assert.equal(g.direction, null);
assert.equal(must(await core.getSession(session.id)).lastConfirmedCheckpointId, null);

g = must(await frame('mock:entrance:approach'));
assert.equal(g.state, 'guiding'); assert.equal(g.direction, 'forward');
g = must(await frame('mock:mural:approach'));
assert.equal(g.state, 'guiding'); assert.equal(g.direction, 'left'); assert.equal(g.text, 'Turn left at the mural.');

// Provider failure: error result, never a guessed turn, position unchanged.
assert.equal(errCode(await frame('mock:provider-error')), 'PROVIDER_UNAVAILABLE');
assert.equal(must(await core.getSession(session.id)).lastConfirmedCheckpointId, 'mural');

// Locale change preserves position and re-renders the same instruction.
must(await core.setLocale(session.id, 'es'));
const es = must(await core.currentGuidance(session.id))!;
assert.equal(es.state, 'guiding'); assert.equal(es.checkpointId, 'mural'); assert.equal(es.direction, 'left');
assert.equal(es.text, 'Gira a la izquierda en el mural.');
assert.equal(must(await core.getSession(session.id)).lastConfirmedCheckpointId, 'mural');

// Stale ordering: an older frame resolving after a newer one is rejected at commit.
let release!: () => void;
hold = { mediaId: 'mock:mural:unknown-approach', until: new Promise((r) => (release = r)) };
const s1 = must(await core.reserveFrameSequence(session.id)).sequence;
const s2 = must(await core.reserveFrameSequence(session.id)).sequence;
const older = frame('mock:mural:unknown-approach', s1); // started first, still recognizing
assert.equal(must(await frame('mock:destination:approach', s2)).state, 'arrived');
release(); hold = null;
assert.equal(errCode(await older), 'STALE_FRAME');
assert.equal(must(await core.getSession(session.id)).lastConfirmedCheckpointId, 'destination');
assert.equal(errCode(await frame('mock:mural:approach', s1)), 'STALE_FRAME'); // replay of old sequence

// Arrival requires destination evidence and is preserved in Spanish.
const arrived = must(await core.currentGuidance(session.id))!;
assert.equal(arrived.state, 'arrived'); assert.equal(arrived.text, 'Has llegado a la sala 204.');
assert.ok(arrived.evidence.length > 0);

// Editing an approved route creates version 2; the running session keeps version 1.
must(await core.saveDraft({ ...draft, version: 2 }));
assert.equal(must(await core.getSession(session.id)).routeVersion, 1);
assert.equal(errCode(await frame('mock:destination:approach')), 'OK');

// Store loading: only a missing file seeds; unreadable, corrupt or foreign files fail and stay byte-for-byte intact.
const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-check-'));
try {
  const file = join(dir, 'store.json');
  const seeded = { ...emptyState(), routes: { [draft.id]: [draft] } };
  const fresh = loadState(file, () => seeded);
  assert.ok(fresh.ok && fresh.seeded);
  assert.equal(existsSync(file), false, 'loading must not write');

  persistState(file, core.state);
  const round = loadState(file, () => assert.fail('must not seed an existing file'));
  assert.ok(round.ok && !round.seeded);
  assert.equal(round.state.routes[draft.id].length, 2);

  for (const bad of ['{"routes": {"demo-route": [', '{"hello": "world"}', '']) {
    writeFileSync(file, bad);
    const r = loadState(file, () => assert.fail('must not seed a corrupt file'));
    assert.equal(r.ok, false, `accepted: ${JSON.stringify(bad)}`);
    assert.equal(readFileSync(file, 'utf8'), bad, 'corrupt file must be left unchanged');
  }

  const unreadable = join(dir, 'is-a-directory');
  mkdirSync(unreadable);
  const r = loadState(unreadable, () => assert.fail('must not seed an unreadable path'));
  assert.ok(!r.ok && r.message.includes('EISDIR'));
} finally {
  rmSync(dir, { recursive: true, force: true }); // only this check's own mkdtemp directory
}

console.log('core check passed: approval, unknown scene, reorient, arrival, stale ordering, provider failure, locale preservation, safe store loading');
