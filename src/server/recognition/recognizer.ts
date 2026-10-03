import { z } from 'zod';
import type { Checkpoint, ErrorCode, Result } from '../../../contracts/contracts.ts';
import type { Recognizer } from '../core/core.ts';
import { readFrame } from '../frames/frames.ts';

const VISIBLE = /[^\s\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\u2800]/u;

export const RecognitionOutputSchema = z.object({
  checkpointId: z.string().min(1).max(200).nullable(),
  approachConfirmed: z.boolean(),
  evidence: z.array(z.string().trim().min(1).max(200).refine((s) => VISIBLE.test(s))).max(20)
    .describe('Only exact visible sign text. Use [] when none is visible.'),
}).strict();
export type Candidate = Pick<Checkpoint, 'id' | 'label' | 'identifyingEvidence' | 'approachDescription'> & {
  action?: Pick<NonNullable<Checkpoint['action']>, 'target' | 'kind' | 'side' | 'targetFloor'>;
};
export type RecognitionProvider = (input: { frame: Uint8Array; candidates: Candidate[] }, signal: AbortSignal) => Promise<unknown>;
export class RecognitionError extends Error {
  code: ErrorCode;
  retryable: boolean;
  constructor(code: ErrorCode, message: string, retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}
const fail = (code: ErrorCode, message: string, retryable = true): Result<never> =>
  ({ ok: false, error: { code, message, retryable } });

export function createRecognizer(deps: {
  provider: RecognitionProvider;
  readFrame?: typeof readFrame;
  directory?: string;
  timeoutMs?: number;
}): Recognizer {
  const flights = new Set<string>();
  return async (route, request) => {
    if (flights.has(request.sessionId)) return fail('RATE_LIMITED', 'A frame for this session is already being checked.');
    flights.add(request.sessionId);
    const signal = AbortSignal.timeout(deps.timeoutMs ?? 15_000);
    const onAbort = () => rejectDeadline(signal.reason);
    let rejectDeadline: (reason: unknown) => void = () => {};
    const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const frame = await Promise.race([(deps.readFrame ?? readFrame)(request.mediaId, deps.directory), deadline]);
      signal.throwIfAborted();
      if (!frame.ok) return frame;
      const candidates: Candidate[] = route.checkpoints.map((cp) => ({
        id: cp.id, label: cp.label, identifyingEvidence: [...cp.identifyingEvidence], approachDescription: cp.approachDescription,
        ...(cp.action ? { action: { target: cp.action.target, kind: cp.action.kind, side: cp.action.side, targetFloor: cp.action.targetFloor } } : {}),
      }));
      let output = await Promise.race([deps.provider({ frame: frame.value, candidates }, signal), deadline]);
      signal.throwIfAborted();
      if (typeof output === 'string') {
        try { output = JSON.parse(output); }
        catch { return fail('PROVIDER_UNAVAILABLE', 'Recognition returned invalid output. Retry the frame.'); }
      }
      const parsed = RecognitionOutputSchema.safeParse(output);
      if (!parsed.success || (parsed.data.checkpointId !== null && !route.checkpoints.some((cp) => cp.id === parsed.data.checkpointId)))
        return fail('PROVIDER_UNAVAILABLE', 'Recognition returned invalid output. Retry the frame.');
      const o = parsed.data;
      return { ok: true, value: o.checkpointId === null ? { kind: 'unknown', evidence: [] }
        : { kind: 'checkpoint', checkpointId: o.checkpointId, approachConfirmed: o.approachConfirmed, evidence: o.evidence } };
    } catch (error) {
      if (signal.aborted) return fail('PROVIDER_UNAVAILABLE', 'Recognition timed out. Retry the frame.');
      if (error instanceof RecognitionError) return fail(error.code, error.message, error.retryable);
      return fail('PROVIDER_UNAVAILABLE', 'Recognition failed. Retry the frame.');
    } finally {
      signal.removeEventListener('abort', onAbort);
      flights.delete(request.sessionId);
    }
  };
}
