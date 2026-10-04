// The one BountyService used by API routes. Bounties persist to BREADCRUMB_BOUNTIES_FILE, by default next to the route data file.
// ponytail: whole-file rewrite per mutation, single process only, like the route store. Flags are read once at process start.
import { dirname, join, resolve } from 'node:path';
import { createNessieClient } from '../nessie/client.ts';
import { core } from '../core/instance.ts';
import { bountyConfig } from './config.ts';
import { loadBounties, persistBounties } from './store.ts';
import { createBountyService, type BountyService, type Out } from './service.ts';

const dataFile = resolve(process.env.BREADCRUMB_DATA_FILE ?? '.data/store.json');
const file = resolve(process.env.BREADCRUMB_BOUNTIES_FILE ?? join(dirname(dataFile), 'bounties.json'));

function build(): BountyService {
  const loaded = loadBounties(file);
  if (!loaded.ok) {
    console.error(`[breadcrumb] ${loaded.message}`);
    // Every call reports the problem; nothing is written, so the existing file stays as it was.
    const failure: Out<never> = { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: `Bounties couldn't be loaded: ${loaded.message}`, retryable: false } };
    return new Proxy({} as BountyService, { get: (_t, key) => (key === 'then' ? undefined : async () => failure) });
  }
  const config = bountyConfig();
  return createBountyService({
    bounties: loaded.bounties, persist: (all) => persistBounties(file, all), config, core,
    nessie: config.enabled ? createNessieClient({ apiKey: config.apiKey, baseUrl: config.baseUrl }) : null,
  });
}

const g = globalThis as unknown as { breadcrumbBounties?: BountyService };
export const bounties = (g.breadcrumbBounties ??= build());
