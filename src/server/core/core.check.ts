// Runnable core check: `npm run check`. Exercises approval, unknown scene, reorientation,
// arrival, stale ordering, provider failure, locale preservation and safe store loading against the kit fixture.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FrameRequest, Route } from '../../../contracts/contracts.ts';
import { approvalProblems, createCore, emptyState, type Recognizer } from './core.ts';
import { loadState, persistState } from './store.ts';
import { mockRecognizer } from '../../shared/mockScenes.ts';
import { fixtureRecognizer } from './actionFixture.ts';
import { RouteSchema } from '../../../contracts/schemas.ts';

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

// Optional actions: the unchanged legacy fixture parses without fabricated actions or evidence.
const legacy = RouteSchema.parse(draft);
assert.ok(legacy.checkpoints.every((cp) => !('action' in cp)));
assert.deepEqual(legacy.checkpoints.map((cp) => cp.identifyingEvidence), draft.checkpoints.map((cp) => cp.identifyingEvidence));
assert.deepEqual(approvalProblems(legacy), []);

const actionFixture = JSON.parse(readFileSync(new URL('../../../contracts/fixture.actions.v1.json', import.meta.url), 'utf8'));
const actionDraft: Route = RouteSchema.parse(actionFixture.route);
assert.deepEqual(approvalProblems(actionDraft), []);
for (const change of [
  (r: Route) => { r.checkpoints[0].action!.target = ' '; },
  (r: Route) => { r.checkpoints[0].action!.completion.es = ''; },
  (r: Route) => { r.checkpoints[1].action!.steps[0].es = ''; },
  (r: Route) => { r.checkpoints[1].action!.targetFloor = null; },
  (r: Route) => { r.checkpoints.at(-1)!.action = structuredClone(r.checkpoints[0].action); },
  (r: Route) => { delete r.checkpoints[0].action; },
]) {
  const invalid = structuredClone(actionDraft); change(invalid);
  assert.ok(approvalProblems(invalid).length, 'incomplete actions must block approval');
}
let clock = 0;
let actionHold: Promise<void> | null = null;
const actionCore = createCore({ now: () => clock, recognizers: { mock: async (route, req) => {
  if (req.mediaId === 'mock:elevator:button' && actionHold) await actionHold;
  return fixtureRecognizer(route, req);
} } });
must(await actionCore.saveDraft(actionDraft));
const actionIds = actionDraft.checkpoints.map((cp) => cp.id);
const published = must(await actionCore.approveRoute(actionDraft.id, 1, actionIds));
const actionSession = must(await actionCore.startSession(actionDraft.id, 'en', 'mock'));
const actionFrame = async (mediaId: string, sequence?: number) => actionCore.matchFrame({
  sessionId: actionSession.id, routeVersion: 1,
  sequence: sequence ?? must(await actionCore.reserveFrameSequence(actionSession.id)).sequence,
  capturedAt: new Date().toISOString(), mediaId,
});
const activeId = async () => must(await actionCore.getSession(actionSession.id)).lastConfirmedCheckpointId;
const manual = async (checkpointId: string, sequence?: number, routeVersion = 1) => actionCore.completeAction(actionSession.id, {
  routeVersion, checkpointId, sequence: sequence ?? must(await actionCore.reserveFrameSequence(actionSession.id)).sequence,
});
assert.equal(errCode(await manual('door-b214')), 'INVALID_INPUT', 'unselected action is not active');
let ag = must(await actionFrame('mock:door-b214:similar-door'));
assert.equal(ag.state, 'uncertain'); assert.equal(ag.direction, null); assert.equal(await activeId(), null);
ag = must(await actionFrame('mock:door-b214:unknown-approach'));
assert.equal(ag.state, 'reorient'); assert.equal(ag.direction, null); assert.equal(await activeId(), null);
ag = must(await actionFrame('mock:door-b214:approach'));
assert.equal(ag.state, 'guiding'); assert.equal(ag.direction, null); assert.equal(ag.checkpointId, 'door-b214');
assert.ok(ag.text.includes('B214') && ag.text.includes('Side: left'));
// Seeing the same action selects/retains it, never completes it.
assert.equal(must(await actionFrame('mock:door-b214:approach')).checkpointId, 'door-b214');
assert.equal(await activeId(), 'door-b214');
ag = must(await actionFrame('mock:elevator:entrance'));
assert.equal(ag.checkpointId, 'elevator'); assert.equal(ag.state, 'guiding'); assert.equal(ag.direction, null);
assert.ok(ag.text.includes('Floor: 3') && ag.text.includes('Press the button marked 3.'));
for (const media of ['mock:elevator:entrance', 'mock:elevator:button', 'mock:elevator:lost-view', 'mock:unrelated', 'mock:floor-3:wrong-floor']) {
  clock += 10 * 60 * 1000; // elapsed time is not completion evidence
  const result = must(await actionFrame(media));
  assert.equal(await activeId(), 'elevator'); assert.equal(result.checkpointId, 'elevator');
  assert.equal(result.direction, null);
  assert.equal(result.state, media.includes('entrance') || media.includes('button') ? 'guiding' : 'uncertain');
}
ag = must(await actionFrame('mock:floor-3:unknown-approach'));
assert.equal(ag.state, 'reorient'); assert.equal(ag.direction, null); assert.equal(await activeId(), 'elevator');
ag = must(await actionFrame('mock:floor-3:approach'));
assert.equal(ag.state, 'guiding'); assert.equal(await activeId(), 'floor-3');
ag = must(await actionFrame('mock:rock:reversed-approach'));
assert.equal(ag.state, 'reorient'); assert.equal(ag.direction, null); assert.equal(await activeId(), 'floor-3');
ag = must(await actionFrame('mock:rock:approach'));
assert.equal(ag.state, 'guiding'); assert.equal(ag.direction, null); assert.equal(await activeId(), 'rock');
must(await actionCore.setLocale(actionSession.id, 'es'));
const rockEs = must(await actionCore.currentGuidance(actionSession.id))!;
assert.equal(rockEs.checkpointId, 'rock'); assert.equal(rockEs.direction, null);
assert.ok(rockEs.text.includes('lado derecho') && rockEs.text.includes('Lado: derecho') && rockEs.text.includes('Rock R1'));
assert.ok(rockEs.text.includes(actionDraft.checkpoints[3].action!.steps[0].es));
assert.equal(await activeId(), 'rock');
assert.equal(errCode(await manual('elevator')), 'INVALID_INPUT', 'wrong step');
assert.equal(errCode(await manual('rock', undefined, 2)), 'STALE_VERSION');
const staleManual = must(await actionCore.reserveFrameSequence(actionSession.id)).sequence;
must(await actionFrame('mock:unrelated'));
assert.equal(errCode(await manual('rock', staleManual)), 'STALE_FRAME');
const manualSeq = must(await actionCore.reserveFrameSequence(actionSession.id)).sequence;
ag = must(await manual('rock', manualSeq));
assert.equal(ag.state, 'arrived'); assert.equal(ag.locale, 'es');
assert.ok(ag.evidence[0].includes('Manual visitor confirmation') && ag.evidence[0].includes('No visual proof'));
assert.equal(errCode(await manual('rock', manualSeq)), 'STALE_FRAME', 'duplicate manual request');
assert.equal(errCode(await manual('rock')), 'INVALID_INPUT', 'completed step is no longer active');
assert.equal(actionCore.state.events.filter((e) => e.kind === 'manual_advance').length, 1);
assert.equal(actionCore.state.events.filter((e) => e.kind === 'checkpoint_confirmed' && e.checkpointId === 'finish').length, 0);

// Manual completion races recognition using the same commit-time freshness rule.
const raceSession = must(await actionCore.startSession(actionDraft.id, 'es', 'mock'));
const raceFrame = async (mediaId: string, sequence?: number) => actionCore.matchFrame({
  sessionId: raceSession.id, routeVersion: 1,
  sequence: sequence ?? must(await actionCore.reserveFrameSequence(raceSession.id)).sequence,
  capturedAt: new Date().toISOString(), mediaId,
});
must(await raceFrame('mock:door-b214:approach'));
must(await raceFrame('mock:elevator:approach'));
const elevatorEs = must(await actionCore.currentGuidance(raceSession.id))!;
assert.ok(elevatorEs.text.includes('Piso: 3') && elevatorEs.text.includes('botón marcado 3') && elevatorEs.text.includes('Floor 3'));
let releaseAction!: () => void;
actionHold = new Promise((r) => { releaseAction = r; });
const oldActionSequence = must(await actionCore.reserveFrameSequence(raceSession.id)).sequence;
const oldActionFrame = raceFrame('mock:elevator:button', oldActionSequence);
const completionSequence = must(await actionCore.reserveFrameSequence(raceSession.id)).sequence;
const manualLanding = must(await actionCore.completeAction(raceSession.id, { routeVersion: 1, sequence: completionSequence, checkpointId: 'elevator' }));
assert.equal(manualLanding.checkpointId, 'floor-3'); assert.equal(manualLanding.locale, 'es');
assert.deepEqual([manualLanding.state, manualLanding.direction, manualLanding.approachConfirmed], ['uncertain', null, false],
  'manual progress does not establish the next checkpoint approach');
assert.ok(manualLanding.evidence[0].includes('No visual proof'));
releaseAction(); actionHold = null;
assert.equal(errCode(await oldActionFrame), 'STALE_FRAME');
assert.equal(must(await raceFrame('mock:floor-3:approach')).direction, 'forward', 'new approach evidence restores the next arrow');

// Named target matching is case-insensitive; completing into a destination requires its own evidence.
let customEvidence = 'b214';
const evidenceCore = createCore({ recognizers: { mock: async (_route, req) => ({ ok: true, value: {
  kind: 'checkpoint', checkpointId: req.mediaId, approachConfirmed: true, evidence: [customEvidence],
} }) } });
must(await evidenceCore.saveDraft(actionDraft)); must(await evidenceCore.approveRoute(actionDraft.id, 1, actionIds));
const evidenceSession = must(await evidenceCore.startSession(actionDraft.id, 'en', 'mock'));
const evidenceFrame = async (id: string) => evidenceCore.matchFrame({ sessionId: evidenceSession.id, routeVersion: 1,
  sequence: must(await evidenceCore.reserveFrameSequence(evidenceSession.id)).sequence, capturedAt: new Date().toISOString(), mediaId: id });
assert.equal(must(await evidenceFrame('door-b214')).state, 'guiding');
for (const [id, evidence] of [['elevator', 'lift a'], ['floor-3', 'floor 3'], ['rock', 'rock r1']]) {
  customEvidence = evidence; assert.equal(must(await evidenceFrame(id)).state, 'guiding');
}
customEvidence = 'different destination';
assert.equal(must(await evidenceFrame('finish')).state, 'uncertain');
customEvidence = 'example finish';
assert.equal(must(await evidenceFrame('finish')).state, 'arrived');

// Published action versions remain immutable, including nested bilingual step text.
published.checkpoints[1].action!.steps[0].en = 'Mutated caller copy';
assert.equal(errCode(await actionCore.saveDraft({ ...actionDraft, name: 'overwrite' })), 'STALE_VERSION');
const nextDraft = structuredClone(actionDraft); nextDraft.version = 2; nextDraft.checkpoints[1].action!.targetFloor = '4';
must(await actionCore.saveDraft(nextDraft)); must(await actionCore.approveRoute(nextDraft.id, 2, actionIds));
assert.equal(must(await actionCore.getSession(raceSession.id)).routeVersion, 1);
assert.equal(must(await actionCore.getRoute(actionDraft.id, 1)).checkpoints[1].action!.targetFloor, '3');
assert.equal(must(await actionCore.getRoute(actionDraft.id, 1)).checkpoints[1].action!.steps[0].en, 'Enter Lift A.');
assert.equal(must(await actionCore.currentGuidance(raceSession.id))!.routeVersion, 1);

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

console.log('core check passed: approval, unknown scene, reorient, arrival, stale ordering, provider failure, locale preservation, safe store loading; action selection/completion, named targets, floor/approach checks, null arrows, manual freshness/race/events, bilingual action speech, immutable action versions');
