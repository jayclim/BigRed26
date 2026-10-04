// The one CoreAdapter used by API routes. State persists to a local JSON file (BREADCRUMB_DATA_FILE).
// ponytail: whole-file rewrite per mutation, single process only. Swap for a database when traffic or hosting needs it.
import { resolve } from 'node:path';
import type { CoreAdapter, Result, Route } from '../../../contracts/contracts.ts';
import fixture from '../../../contracts/fixture.v1.json';
import actionFixture from '../../../contracts/fixture.actions.v1.json';
import { fixtureRecognizer } from './actionFixture.ts';
import { createCore, emptyState } from './core.ts';
import { liveRecognitionEnabled, liveRecognizer } from '../recognition/gemini.ts';
import { loadState, persistState } from './store.ts';

const file = resolve(process.env.BREADCRUMB_DATA_FILE ?? '.data/store.json');

function seed() {
  const state = emptyState();
  // The kit's fictional example starts as an unreviewed draft so the creator flow begins at review.
  state.routes[fixture.route.id] = [{ ...(fixture.route as Route), status: 'draft' }];
  state.routes[actionFixture.route.id] = [structuredClone(actionFixture.route) as Route];
  return state;
}

function build(): CoreAdapter {
  const loaded = loadState(file, seed);
  if (!loaded.ok) {
    console.error(`[breadcrumb] ${loaded.message}`);
    // Every call reports the problem; nothing is written, so the existing file stays as it was.
    const failure: Result<never> = { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: `Local data couldn't be loaded: ${loaded.message}`, retryable: false } };
    return new Proxy({} as CoreAdapter, { get: (_t, key) => (key === 'then' ? undefined : async () => failure) });
  }
  // Writes happen only on mutations (never at import), so `next build` workers don't touch the file.
  return createCore({
    state: loaded.state,
    persist: (state) => persistState(file, state),
    // Live needs BREADCRUMB_GEMINI_RECOGNITION=1 and GEMINI_API_KEY. Absent = live start fails honestly, no fallback.
    // Replay has no recognizer yet. ponytail: flags are read once at process start.
    recognizers: { mock: fixtureRecognizer, ...(liveRecognitionEnabled() ? { live: liveRecognizer } : {}) },
  });
}

// globalThis keeps one instance across Next.js dev reloads and route bundles. Fix a bad file, then restart.
const g = globalThis as unknown as { breadcrumbCore?: CoreAdapter };
export const core = (g.breadcrumbCore ??= build());
