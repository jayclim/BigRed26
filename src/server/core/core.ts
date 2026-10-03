// Breadcrumb core: route lifecycle, sessions and the guidance state machine.
// Pure logic over a plain state object; persistence and HTTP live elsewhere (instance.ts, http.ts).
import { randomUUID } from 'node:crypto';
import type {
  Checkpoint, CoreAdapter, ErrorCode, EventKind, FrameRequest, Guidance, Id, Locale, Mode,
  NavigationEvent, Result, Route, Session,
} from '../../../contracts/contracts.ts';
import { FrameRequestSchema, ManualCompletionBodySchema, RouteSchema } from '../../../contracts/schemas.ts';

/** What a recognizer reports about one frame. The core, not the recognizer, decides guidance. */
export type Observation =
  | { kind: 'unknown'; evidence: string[] }
  | { kind: 'checkpoint'; checkpointId: Id; approachConfirmed: boolean; evidence: string[] };
export type Recognizer = (route: Route, request: FrameRequest) => Promise<Result<Observation>>;

type Decision = Pick<Guidance, 'state' | 'checkpointId' | 'direction' | 'evidence' | 'sequence' | 'processingMs'> & {
  nextCheckpointId?: Id;
};
interface SessionRecord { session: Session; reservedSequence: number; last: Decision | null }
export interface CoreState {
  routes: Record<Id, Route[]>; // index = version - 1
  sessions: Record<Id, SessionRecord>;
  events: NavigationEvent[];
}

export const emptyState = (): CoreState => ({ routes: {}, sessions: {}, events: [] });

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T = never>(code: ErrorCode, message: string, retryable = false): Result<T> =>
  ({ ok: false, error: { code, message, retryable } });

const COPY = {
  unknown: {
    en: () => 'Point toward a room sign so I can check your location.',
    es: () => 'Apunta hacia un letrero de sala para que pueda comprobar tu ubicación.',
  },
  notNearby: {
    en: (label: string) => `That doesn't match the next part of this route. Head back toward ${label}.`,
    es: (label: string) => `Eso no coincide con la siguiente parte de esta ruta. Vuelve hacia ${label}.`,
  },
  // ponytail: approachDescription is English-only in contract v1, so the Spanish line embeds it as-is.
  reorient: {
    en: (label: string, approach: string) => `I recognize ${label}. Turn until the view matches: ${approach}.`,
    es: (label: string, approach: string) => `Reconozco ${label}. Gira hasta que la vista coincida: ${approach}.`,
  },
};

/** Problems that block approval. Empty array means approvable. */
export function approvalProblems(route: Route): string[] {
  const p: string[] = [];
  const cps = route.checkpoints;
  cps.forEach((c, i) => {
    if (c.order !== i) p.push(`Checkpoint "${c.label}" is out of order.`);
    if (!c.instruction.en.trim() || !c.instruction.es.trim()) p.push(`"${c.label}" needs both English and Spanish instructions.`);
    if (!c.isDestination && c.direction === null && !c.action) p.push(`"${c.label}" needs a direction or an action.`);
    if (c.isDestination && c.direction !== null) p.push(`Destination "${c.label}" must not have a direction.`);
    if (c.isDestination && c.action) p.push(`Destination "${c.label}" must not have an action.`);
    if (c.action) {
      const a = c.action;
      if (!a.target.trim()) p.push(`"${c.label}" needs an action target.`);
      if (!a.completion.en.trim() || !a.completion.es.trim()) p.push(`"${c.label}" needs both completion locales.`);
      if (a.steps.some((step) => !step.en.trim() || !step.es.trim())) p.push(`"${c.label}" needs both locales for every action step.`);
      if (a.kind === 'elevator' && !a.targetFloor?.trim()) p.push(`"${c.label}" needs an elevator target floor.`);
    }
    if (c.isDestination !== (i === cps.length - 1)) p.push('Exactly one destination, as the last checkpoint.');
  });
  if (new Set(cps.map((c) => c.id)).size !== cps.length) p.push('Checkpoint ids must be unique.');
  return [...new Set(p)];
}

/** One approved instruction for display/speech, including literal signs and localized qualifiers. */
function instructionText(cp: Checkpoint, locale: Locale): string {
  const a = cp.action;
  if (!a) return cp.instruction[locale];
  const side = a.side === null ? '' : locale === 'es'
    ? `Lado: ${a.side === 'right' ? 'derecho' : 'izquierdo'}.`
    : `Side: ${a.side}.`;
  return [cp.instruction[locale], `${locale === 'es' ? 'Referencia' : 'Target'}: ${a.target}.`, side,
    a.targetFloor ? `${locale === 'es' ? 'Piso' : 'Floor'}: ${a.targetFloor}.` : '',
    ...a.steps.map((step) => step[locale]), a.completion[locale]].filter(Boolean).join(' ');
}

export function createCore(opts: {
  state?: CoreState;
  recognizers: Partial<Record<Mode, Recognizer>>;
  persist?: (state: CoreState) => void;
  now?: () => number;
}): CoreAdapter & { state: CoreState } {
  const state = opts.state ?? emptyState();
  const now = opts.now ?? Date.now;
  const save = () => opts.persist?.(state);

  const latest = (routeId: Id) => state.routes[routeId]?.at(-1);
  const getVersion = (routeId: Id, version?: number) =>
    version === undefined ? latest(routeId) : state.routes[routeId]?.[version - 1];

  function record(s: Session, kind: EventKind, checkpointId: Id | null, sequence: number | null, latencyMs: number | null) {
    state.events.push({
      id: randomUUID(), sessionId: s.id, routeId: s.routeId, routeVersion: s.routeVersion,
      checkpointId, sequence, at: new Date(now()).toISOString(), mode: s.mode, kind, latencyMs,
    });
  }

  function render(s: Session, route: Route, d: Decision): Guidance {
    const L: Locale = s.locale;
    const cp = route.checkpoints.find((c) => c.id === d.checkpointId);
    const base = {
      sessionId: s.id, sequence: d.sequence, routeVersion: s.routeVersion, mode: s.mode, locale: L,
      evidence: d.evidence, processingMs: d.processingMs,
    };
    const v = `${L}-v${s.routeVersion}`;
    if (d.state === 'guiding' && cp && d.nextCheckpointId)
      return { ...base, state: 'guiding', checkpointId: cp.id, nextCheckpointId: d.nextCheckpointId,
        direction: d.direction, approachConfirmed: true, instructionId: `${cp.id}-${v}`, text: instructionText(cp, L) };
    if (d.state === 'arrived' && cp)
      return { ...base, state: 'arrived', checkpointId: cp.id, direction: null, approachConfirmed: true,
        instructionId: `${cp.id}-${v}`, text: cp.instruction[L] };
    let text: string;
    if (d.state === 'reorient' && cp) text = COPY.reorient[L](cp.label, cp.approachDescription);
    else if (cp?.action) text = L === 'en'
      ? `Keep the current action at ${cp.action.target}. I cannot confirm this view. Check the approved target and approach.`
      : `Mantén la acción actual en ${cp.action.target}. No puedo confirmar esta vista. Comprueba el objetivo aprobado y la orientación.`;
    else if (d.evidence.length && d.state === 'uncertain') text = COPY.notNearby[L](expectedNext(s, route)?.label ?? route.destinationLabel);
    else text = COPY.unknown[L]();
    const state = d.state === 'reorient' ? 'reorient' : d.state === 'off_route' ? 'off_route' : 'uncertain';
    return { ...base, state, checkpointId: d.checkpointId, direction: null, approachConfirmed: false,
      instructionId: `${state}-${d.checkpointId ?? 'none'}-${d.evidence.length ? 'seen' : 'unseen'}-${v}`, text };
  }

  function progressIndex(s: Session, route: Route) {
    return route.checkpoints.findIndex((c) => c.id === s.lastConfirmedCheckpointId); // -1 = not started
  }
  function expectedNext(s: Session, route: Route) {
    return route.checkpoints[Math.min(progressIndex(s, route) + 1, route.checkpoints.length - 1)];
  }

  /** Turns one observation into a decision, restricted to the current or next checkpoint. */
  function decide(s: Session, route: Route, o: Observation, sequence: number, processingMs: number): Decision {
    const p = progressIndex(s, route);
    const base = { sequence, processingMs, evidence: o.evidence, direction: null };
    if (o.kind === 'unknown' || o.evidence.length === 0)
      return { ...base, evidence: [], state: 'uncertain', checkpointId: s.lastConfirmedCheckpointId };
    const i = route.checkpoints.findIndex((c) => c.id === o.checkpointId);
    // ponytail: candidates are the confirmed checkpoint and the next one. Real footage may need a wider window.
    if (i < 0 || i < Math.max(p, 0) || i > p + 1)
      return { ...base, state: 'uncertain', checkpointId: s.lastConfirmedCheckpointId };
    const cp = route.checkpoints[i];
    if (cp.action && !o.evidence.some((e) => e.toLowerCase().includes(cp.action!.target.trim().toLowerCase())))
      return { ...base, state: 'uncertain', checkpointId: s.lastConfirmedCheckpointId };
    // Completing an action against a legacy next step still needs that step's approved identifying evidence.
    if (i === p + 1 && route.checkpoints[p]?.action && !cp.action && !cp.identifyingEvidence.some((target) =>
      target.trim() && o.evidence.some((e) => e.toLowerCase().includes(target.trim().toLowerCase()))))
      return { ...base, state: 'uncertain', checkpointId: s.lastConfirmedCheckpointId };
    if (!o.approachConfirmed) return { ...base, state: 'reorient', checkpointId: cp.id };
    if (cp.isDestination) return { ...base, state: 'arrived', checkpointId: cp.id };
    const next = route.checkpoints[i + 1];
    if ((!cp.direction && !cp.action) || !next) return { ...base, state: 'uncertain', checkpointId: s.lastConfirmedCheckpointId };
    return { ...base, state: 'guiding', checkpointId: cp.id, direction: cp.direction, nextCheckpointId: next.id };
  }

  function sessionOf(sessionId: Id): Result<SessionRecord> {
    const r = state.sessions[sessionId];
    return r ? ok(r) : fail('NOT_FOUND', 'Session not found.');
  }

  return {
    state,

    async startBuild() {
      return fail('PROVIDER_UNAVAILABLE', 'Route extraction from video is not implemented in this mock milestone.');
    },
    async getBuild() {
      return fail('NOT_FOUND', 'No build jobs exist in this mock milestone.');
    },

    async getRoute(routeId, version) {
      const r = getVersion(routeId, version);
      return r ? ok(structuredClone(r)) : fail('NOT_FOUND', 'Route not found.');
    },

    async saveDraft(input) {
      const parsed = RouteSchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid route.');
      const route = { ...parsed.data, status: 'draft' as const };
      const versions = (state.routes[route.id] ??= []);
      const head = versions.at(-1);
      if (!head) {
        if (route.version !== 1) return fail('STALE_VERSION', 'A new route starts at version 1.');
        versions.push(route);
      } else if (head.status === 'draft' && route.version === head.version) {
        versions[route.version - 1] = route;
      } else if (head.status === 'approved' && route.version === head.version + 1) {
        versions.push(route); // editing an approved route creates the next version
      } else {
        return fail('STALE_VERSION', head.status === 'approved' && route.version === head.version
          ? `Version ${head.version} is approved and immutable. Save as version ${head.version + 1}.`
          : `Latest version is ${head.version} (${head.status}).`);
      }
      save();
      return ok(structuredClone(route));
    },

    async approveRoute(routeId, version, reviewedCheckpointIds) {
      const route = getVersion(routeId, version);
      if (!route) return fail('NOT_FOUND', 'Route version not found.');
      if (route.status === 'approved') return fail('STALE_VERSION', `Version ${version} is already approved.`);
      if (route !== latest(routeId)) return fail('STALE_VERSION', 'Only the latest draft can be approved.');
      const unreviewed = route.checkpoints.filter((c) => !reviewedCheckpointIds.includes(c.id));
      if (unreviewed.length) return fail('NOT_APPROVED', `Review every checkpoint first: ${unreviewed.map((c) => c.label).join(', ')}.`);
      const problems = approvalProblems(route);
      if (problems.length) return fail('INVALID_INPUT', problems.join(' '));
      route.status = 'approved';
      save();
      return ok(structuredClone(route));
    },

    async startSession(routeId, locale, mode) {
      if (!opts.recognizers[mode])
        return fail('PROVIDER_UNAVAILABLE', `${mode} input is not available in this build. Choose mock explicitly; there is no automatic fallback.`);
      const route = state.routes[routeId]?.findLast((r) => r.status === 'approved');
      if (!route) return fail(state.routes[routeId] ? 'NOT_APPROVED' : 'NOT_FOUND', 'Approve the route before starting a guide session.');
      const session: Session = {
        id: randomUUID(), routeId, routeVersion: route.version, locale, mode,
        lastConfirmedCheckpointId: null, lastAcceptedSequence: 0,
      };
      state.sessions[session.id] = { session, reservedSequence: 0, last: null };
      save();
      return ok({ ...session });
    },

    async getSession(sessionId) {
      const r = sessionOf(sessionId);
      return r.ok ? ok({ ...r.value.session }) : r;
    },

    async setLocale(sessionId, locale) {
      const r = sessionOf(sessionId);
      if (!r.ok) return r;
      r.value.session.locale = locale; // position is untouched by design
      save();
      return ok({ ...r.value.session });
    },

    async reserveFrameSequence(sessionId) {
      const r = sessionOf(sessionId);
      if (!r.ok) return r;
      const sequence = ++r.value.reservedSequence;
      save();
      return ok({ sequence, routeVersion: r.value.session.routeVersion });
    },

    async matchFrame(input) {
      const parsed = FrameRequestSchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid frame request.');
      const req = parsed.data;
      const r = sessionOf(req.sessionId);
      if (!r.ok) return r;
      const rec = r.value;
      const s = rec.session;
      if (req.routeVersion !== s.routeVersion) return fail('STALE_VERSION', 'Frame is for a different route version.');
      if (req.sequence > rec.reservedSequence) return fail('INVALID_INPUT', 'Reserve a frame sequence first.');
      if (req.sequence <= s.lastAcceptedSequence) return fail('STALE_FRAME', 'A newer frame was already accepted.', true);
      const route = state.routes[s.routeId][s.routeVersion - 1];
      const started = now();
      const recognizer = opts.recognizers[s.mode];
      let observed: Result<Observation>;
      try {
        observed = recognizer ? await recognizer(route, req) : fail('PROVIDER_UNAVAILABLE', 'No recognizer for this mode.', false);
      } catch {
        observed = fail('PROVIDER_UNAVAILABLE', 'Recognition failed.', true);
      }
      const processingMs = now() - started;
      // Commit point: re-check ordering after the await. No awaits below, so this check-and-write is atomic.
      if (req.sequence <= s.lastAcceptedSequence) return fail('STALE_FRAME', 'A newer frame was accepted while this one was processing.', true);
      if (!observed.ok) {
        record(s, 'provider_error', s.lastConfirmedCheckpointId, req.sequence, processingMs);
        save();
        // Never turn a provider failure into guidance; the previous guidance stays in place.
        return fail(observed.error.code, observed.error.message, observed.error.retryable);
      }
      const d = decide(s, route, observed.value, req.sequence, processingMs);
      s.lastAcceptedSequence = req.sequence;
      if (d.state === 'guiding' || d.state === 'arrived') {
        if (d.checkpointId !== s.lastConfirmedCheckpointId) record(s, 'checkpoint_confirmed', d.checkpointId, req.sequence, processingMs);
        s.lastConfirmedCheckpointId = d.checkpointId;
      }
      rec.last = d;
      record(s, 'frame_processed', d.checkpointId, req.sequence, processingMs);
      if (d.state !== 'guiding') record(s, d.state, d.checkpointId, req.sequence, processingMs);
      save();
      return ok(render(s, route, d));
    },

    async currentGuidance(sessionId) {
      const r = sessionOf(sessionId);
      if (!r.ok) return r;
      const { session: s, last } = r.value;
      return ok(last ? render(s, state.routes[s.routeId][s.routeVersion - 1], last) : null);
    },

    async completeAction(sessionId, input) {
      const parsed = ManualCompletionBodySchema.safeParse(input);
      if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid manual completion.');
      const req = parsed.data;
      const r = sessionOf(sessionId);
      if (!r.ok) return r;
      const rec = r.value;
      const s = rec.session;
      if (req.routeVersion !== s.routeVersion) return fail('STALE_VERSION', 'Manual completion is for a different route version.');
      if (req.sequence > rec.reservedSequence) return fail('INVALID_INPUT', 'Reserve a frame sequence first.');
      if (req.sequence <= s.lastAcceptedSequence) return fail('STALE_FRAME', 'A newer request was already accepted.', true);
      const route = state.routes[s.routeId][s.routeVersion - 1];
      const cp = route.checkpoints[progressIndex(s, route)];
      if (!cp?.action || cp.id !== req.checkpointId)
        return fail('INVALID_INPUT', 'Manual completion requires the currently active action checkpoint.');
      const next = route.checkpoints[cp.order + 1];
      if (!next) return fail('INVALID_INPUT', 'Action has no next checkpoint.');
      const d: Decision = {
        sequence: req.sequence, processingMs: 0,
        evidence: [`Manual visitor confirmation: completed ${cp.label}; advanced to ${next.label}. No visual proof.`],
        // Manual completion supplies progress, but no approach proof for the next checkpoint.
        state: next.isDestination ? 'arrived' : 'uncertain', checkpointId: next.id,
        direction: null,
      };
      s.lastAcceptedSequence = req.sequence;
      s.lastConfirmedCheckpointId = next.id;
      rec.last = d;
      record(s, 'manual_advance', cp.id, req.sequence, 0);
      save();
      return ok(render(s, route, d));
    },

    async routeQuality(routeId, version, since, mode) {
      const route = getVersion(routeId, version);
      if (!route) return fail('NOT_FOUND', 'Route version not found.');
      const events = state.events.filter((e) => e.routeId === routeId && e.routeVersion === version && e.mode === mode && e.at >= since);
      const count = (cpId: Id, kind: EventKind) => events.filter((e) => e.checkpointId === cpId && e.kind === kind);
      return ok({
        routeId, routeVersion: version, since, mode,
        checkpoints: route.checkpoints.map((c) => ({
          checkpointId: c.id,
          helpRequests: count(c.id, 'help_requested').length,
          uncertainEvents: count(c.id, 'uncertain').length,
          confirmedSessions: new Set(count(c.id, 'checkpoint_confirmed').map((e) => e.sessionId)).size,
        })),
      });
    },
  };
}
