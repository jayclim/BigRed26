import type { CoreAdapter, Guidance, Id, Result } from '../../../contracts/contracts.ts';

export interface Flight { current: boolean }
export type CheckOutcome = Result<Guidance> | null;
/** Null means refused, obsolete, or STALE_FRAME. The caller keeps its accepted view. */
export async function checkView({ core, sessionId, upload, frame, capturedAt, isCurrent, flight }: {
  core: CoreAdapter; sessionId: Id;
  upload: (sessionId: Id, frame: Blob) => Promise<Result<{ mediaId: Id }>>;
  frame: () => Promise<Blob>; capturedAt: string; isCurrent: () => boolean; flight: Flight;
}): Promise<CheckOutcome> {
  if (flight.current || !isCurrent()) return null;
  flight.current = true;
  try {
    const blob = await frame();
    if (!isCurrent()) return null;
    const uploaded = await upload(sessionId, blob);
    if (!isCurrent()) return null;
    if (!uploaded.ok) return uploaded;
    const sequence = await core.reserveFrameSequence(sessionId);
    if (!isCurrent()) return null;
    if (!sequence.ok) return sequence;
    const result = await core.matchFrame({ sessionId, ...sequence.value, capturedAt, mediaId: uploaded.value.mediaId });
    if (!isCurrent() || (!result.ok && result.error.code === 'STALE_FRAME')) return null;
    return result;
  } catch {
    return isCurrent() ? { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'The camera view could not be checked. Try again.', retryable: true } } : null;
  } finally { flight.current = false; }
}
