// Per-client abuse limits for the public bounty API. Memory only, so the ceiling is per process.
// ponytail: the key is the last X-Forwarded-For entry (Cloudflare and ngrok append the address they saw), the same rule as the live guide.
export { clientKey } from '../live/liveLimits.ts';
import { UNKNOWN_CLIENT } from '../live/liveLimits.ts';

const MINUTE = 60_000, HOUR = 3_600_000, MAX_CLIENTS = 1000;
export type LimitKind = 'post' | 'claim' | 'act';
// act covers submit, pay, cancel and reject, so guessing a secret is slow even before the secret length does the work.
export const RULES: Record<LimitKind, { perMinute: number; perHour: number }> = {
  post: { perMinute: 2, perHour: 5 },
  claim: { perMinute: 3, perHour: 10 },
  act: { perMinute: 20, perHour: 120 },
};
export const GLOBAL_POSTS_PER_HOUR = 60;

export interface Limiter { clients: Map<string, number[]>; globalPosts: number[] }
export const createLimiter = (): Limiter => ({ clients: new Map(), globalPosts: [] });
const within = (times: number[], now: number, ms: number) => { let n = 0; for (let i = times.length - 1; i >= 0 && times[i] > now - ms; i--) n++; return n; };

/** Records the request and returns true, or returns false and records nothing. Synchronous, so it cannot interleave. */
export function allow(state: Limiter, kind: LimitKind, client: string, now: number): boolean {
  for (const [key, times] of state.clients) {
    while (times.length && times[0] <= now - HOUR) times.shift();
    if (!times.length) state.clients.delete(key);
  }
  while (state.globalPosts.length && state.globalPosts[0] <= now - HOUR) state.globalPosts.shift();
  const rule = RULES[kind];
  const name = `${kind}|${client}`;
  const key = state.clients.has(name) || state.clients.size < MAX_CLIENTS ? name : `${kind}|${UNKNOWN_CLIENT}`;
  const mine = state.clients.get(key) ?? [];
  if (within(mine, now, MINUTE) >= rule.perMinute || mine.length >= rule.perHour) return false;
  if (kind === 'post' && state.globalPosts.length >= GLOBAL_POSTS_PER_HOUR) return false;
  mine.push(now); state.clients.set(key, mine);
  if (kind === 'post') state.globalPosts.push(now);
  return true;
}
