// TEST DOUBLE, not product. Synthetic observations keyed by `mock:<checkpoint>:<kind>` media ids so core, HTTP and
// browser checks can drive the route rules without a camera or a model. Production registers no recognizer for the
// `mock` mode; only checks and the isolated test server (BREADCRUMB_TEST_FIXTURES=1) use this.
import type { Result } from '../../../contracts/contracts.ts';
import type { Observation, Recognizer } from '../core/core.ts';

export const mockRecognizer: Recognizer = async (route, req): Promise<Result<Observation>> => {
  const [prefix, cpId, kind] = req.mediaId.split(':');
  if (prefix !== 'mock') return { ok: false, error: { code: 'INVALID_INPUT', message: 'Test sessions accept only test scene ids.', retryable: false } };
  if (cpId === 'provider-error') return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Simulated recognizer failure (test).', retryable: true } };
  if (cpId === 'unrelated') return { ok: true, value: { kind: 'unknown', evidence: [] } };
  const cp = route.checkpoints.find((c) => c.id === cpId);
  if (!cp || (kind !== 'approach' && kind !== 'unknown-approach'))
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'Unknown test scene.', retryable: false } };
  return {
    ok: true,
    value: {
      kind: 'checkpoint', checkpointId: cp.id, approachConfirmed: kind === 'approach',
      evidence: cp.identifyingEvidence.map((e) => `Synthetic observation: ${e}`),
    },
  };
};
