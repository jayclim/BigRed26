import type { Guidance, Session } from '../../../contracts/contracts.ts';

/** Session progress is authoritative, including manual advances with uncertain guidance. */
export function reconcileGuide(session: Session, guidance: Guidance | null, lastSequence: number) {
  if (session.lastAcceptedSequence < lastSequence) return null;
  return {
    checkpointId: session.lastConfirmedCheckpointId,
    sequence: session.lastAcceptedSequence,
    // A session can advance between the two reads. Do not display an older instruction beside it.
    guidance: guidance?.sequence === session.lastAcceptedSequence ? guidance : null,
  };
}
