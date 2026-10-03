// The one CoreAdapter used by API routes. State persists to a local JSON file (BREADCRUMB_DATA_FILE).
// ponytail: whole-file rewrite per mutation, single process only. Swap for a database when traffic or hosting needs it.
import { resolve } from 'node:path';
import type { CoreAdapter, Result, Route } from '../../../contracts/contracts.ts';
import fixture from '../../../contracts/fixture.v1.json';
import { mockRecognizer } from '../../shared/mockScenes.ts';
import { createCore, emptyState } from './core.ts';
import { loadState, persistState } from './store.ts';

const file = resolve(process.env.BREADCRUMB_DATA_FILE ?? '.data/store.json');

function seed() {
  const state = emptyState();
  // The kit's fictional example starts as an unreviewed draft so the creator flow begins at review.
  state.routes[fixture.route.id] = [{ ...(fixture.route as Route), status: 'draft' }];
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
    // Live (Gemini) and replay recognizers register here in the next milestone. Absent = start fails honestly.
    recognizers: { mock: mockRecognizer },
  });
}

// globalThis keeps one instance across Next.js dev reloads and route bundles. Fix a bad file, then restart.
const g = globalThis as unknown as { breadcrumbCore?: CoreAdapter };
export const core = (g.breadcrumbCore ??= build());
