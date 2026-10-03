// Synthetic observations for MOCK mode. A person picks one explicitly; nothing here looks at camera pixels.
// Pure module: the guide UI lists these scenes and the server mock recognizer resolves them.
import type { Id, Result, Route } from '../../contracts/contracts.ts';
import type { Observation, Recognizer } from '../server/core/core.ts';

export interface MockScene { mediaId: Id; label: string; group: 'checkpoint' | 'other' }

export function mockScenes(route: Route): MockScene[] {
  return [
    ...route.checkpoints.flatMap((c): MockScene[] => [
      { mediaId: `mock:${c.id}:approach`, label: `${c.label}, approached as recorded`, group: 'checkpoint' },
      { mediaId: `mock:${c.id}:unknown-approach`, label: `${c.label}, facing unclear`, group: 'checkpoint' },
    ]),
    { mediaId: 'mock:unrelated', label: 'Unrelated view (not on this route)', group: 'other' },
    { mediaId: 'mock:provider-error', label: 'Recognizer failure', group: 'other' },
  ];
}

export const mockRecognizer: Recognizer = async (route, req): Promise<Result<Observation>> => {
  const [prefix, cpId, kind] = req.mediaId.split(':');
  if (prefix !== 'mock') return { ok: false, error: { code: 'INVALID_INPUT', message: 'Mock sessions accept only mock scene ids.', retryable: false } };
  if (cpId === 'provider-error') return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Simulated recognizer failure (mock).', retryable: true } };
  if (cpId === 'unrelated') return { ok: true, value: { kind: 'unknown', evidence: [] } };
  const cp = route.checkpoints.find((c) => c.id === cpId);
  if (!cp || (kind !== 'approach' && kind !== 'unknown-approach'))
    return { ok: false, error: { code: 'INVALID_INPUT', message: 'Unknown mock scene.', retryable: false } };
  return {
    ok: true,
    value: {
      kind: 'checkpoint', checkpointId: cp.id, approachConfirmed: kind === 'approach',
      evidence: cp.identifyingEvidence.map((e) => `Synthetic observation: ${e}`),
    },
  };
};
