// Explicit MOCK observations only. These are no evidence of physical navigation safety.
import fixture from '../../../contracts/fixture.actions.v1.json' with { type: 'json' };
import type { Recognizer, Observation } from './core.ts';
import { mockRecognizer } from '../../shared/mockScenes.ts';

export const fixtureRecognizer: Recognizer = async (route, request) => {
  const scene = route.id === fixture.route.id
    ? fixture.observations.find((s) => s.mediaId === request.mediaId) : undefined;
  return scene ? { ok: true, value: structuredClone(scene.observation) as Observation }
    : mockRecognizer(route, request);
};
