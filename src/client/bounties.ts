// Browser client for /api/bounties. Same Result envelope as the other clients; error codes are plain strings here.
import type { Board } from '@/server/bounties/service.ts';
import type { PublicBounty } from '@/server/bounties/types.ts';

export type { Board, PublicBounty };
export type BountyResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; retryable: boolean } };

async function call<T>(method: string, path: string, body?: unknown): Promise<BountyResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method, cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: "Can't reach the Breadcrumb server.", retryable: true } };
  }
  try {
    return (await res.json()) as BountyResult<T>;
  } catch {
    return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: `Unexpected ${res.status} response.`, retryable: res.status >= 500 } };
  }
}
const e = encodeURIComponent;

export const bountiesApi = {
  board: () => call<Board>('GET', '/api/bounties'),
  get: (id: string) => call<PublicBounty>('GET', `/api/bounties/${e(id)}`),
  create: (input: { title: string; description: string; poster: string; rewardUsd: number }) =>
    call<{ bounty: PublicBounty; posterSecret: string }>('POST', '/api/bounties', input),
  claim: (id: string, input: { creatorName: string; accountId?: string; createAccount?: boolean }) =>
    call<{ bounty: PublicBounty; claimSecret: string }>('POST', `/api/bounties/${e(id)}/claim`, input),
  submit: (id: string, routeId: string, claimSecret: string) => call<PublicBounty>('POST', `/api/bounties/${e(id)}/submit`, { routeId, claimSecret }),
  pay: (id: string, posterSecret: string, retryUncertain = false) =>
    call<PublicBounty>('POST', `/api/bounties/${e(id)}/pay`, retryUncertain ? { posterSecret, retryUncertain } : { posterSecret }),
  cancel: (id: string, posterSecret: string) => call<PublicBounty>('POST', `/api/bounties/${e(id)}/cancel`, { posterSecret }),
  reject: (id: string, posterSecret: string) => call<PublicBounty>('POST', `/api/bounties/${e(id)}/reject`, { posterSecret }),
};

// Secrets stay on this device only so the poster or creator does not retype them. Storage can be blocked, so every access is guarded.
type Saved = { posterSecret?: string; claimSecret?: string };
const keyOf = (id: string) => `breadcrumb.bounty.${id}`;
export function savedSecrets(id: string): Saved {
  try { return JSON.parse(localStorage.getItem(keyOf(id)) ?? '{}') as Saved; } catch { return {}; }
}
export function saveSecret(id: string, field: keyof Saved, value: string) {
  try { localStorage.setItem(keyOf(id), JSON.stringify({ ...savedSecrets(id), [field]: value })); } catch { /* the secret is still shown once on screen */ }
}
