// Abuse and cost controls for POST /api/live/token. Every token can start a paid Gemini session, and the app can sit
// behind a public tunnel. Checks run before any provider call and fail closed.
// ponytail: state is in memory, so the ceiling is per process. If this runs on more than one instance, move it to a shared store.

export const CLIENT_PER_MINUTE = 3;
export const CLIENT_PER_HOUR = 10;
export const GLOBAL_PER_MINUTE = 20; // burst cap, process wide
export const DEFAULT_TOKENS_PER_HOUR = 30; // hard cap, rolling hour, all clients
export const DEFAULT_TOKENS_PER_DAY = 100; // hard cap, UTC day, all clients
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const MAX_CLIENTS = 1000; // bounds memory when forwarded addresses are forged
export const UNKNOWN_CLIENT = 'unknown';

export interface LiveCaps { perHour: number; perDay: number }
export interface LimitState { global: number[]; clients: Map<string, number[]>; dayKey: number; dayCount: number }
export const createLimitState = (): LimitState => ({ global: [], clients: new Map(), dayKey: -1, dayCount: 0 });

const positiveInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
};
export const liveCaps = (env: Record<string, string | undefined> = process.env): LiveCaps => ({
  perHour: positiveInt(env.BREADCRUMB_LIVE_TOKENS_PER_HOUR, DEFAULT_TOKENS_PER_HOUR),
  perDay: positiveInt(env.BREADCRUMB_LIVE_TOKENS_PER_DAY, DEFAULT_TOKENS_PER_DAY),
});

/** The last X-Forwarded-For entry, else one shared bucket. The tunnel appends the address it saw, so earlier
 * entries can be client-supplied. ponytail: assumes exactly one trusted proxy (ngrok to 127.0.0.1). */
export function clientKey(forwardedFor: string | null | undefined): string {
  const last = forwardedFor?.split(',').at(-1)?.trim().slice(0, 64);
  return last || UNKNOWN_CLIENT;
}

export type LimitDenial = { message: string; retryable: boolean };
const within = (times: number[], now: number, ms: number) => { let n = 0; for (let i = times.length - 1; i >= 0 && times[i] > now - ms; i--) n++; return n; };

/** Records one grant and returns null, or returns a denial and records nothing. Synchronous, so it cannot interleave. */
export function checkAndRecord(state: LimitState, client: string, now: number, caps: LiveCaps): LimitDenial | null {
  while (state.global.length && state.global[0] <= now - HOUR) state.global.shift();
  for (const [key, times] of state.clients) {
    while (times.length && times[0] <= now - HOUR) times.shift();
    if (!times.length) state.clients.delete(key);
  }
  const key = state.clients.has(client) || state.clients.size < MAX_CLIENTS ? client : UNKNOWN_CLIENT;
  const mine = state.clients.get(key) ?? [];
  if (within(mine, now, MINUTE) >= CLIENT_PER_MINUTE) return { message: 'Too many live guide starts from this device. Wait a minute and retry.', retryable: true };
  if (mine.length >= CLIENT_PER_HOUR) return { message: 'Too many live guide starts from this device this hour. Try again later.', retryable: true };
  if (within(state.global, now, MINUTE) >= GLOBAL_PER_MINUTE) return { message: 'The live guide is busy. Wait a minute and retry.', retryable: true };
  if (state.global.length >= caps.perHour) return { message: 'The live guide has reached its hourly limit. Try again later.', retryable: true };
  const dayKey = Math.floor(now / DAY);
  if (state.dayKey !== dayKey) { state.dayKey = dayKey; state.dayCount = 0; }
  if (state.dayCount >= caps.perDay) return { message: 'The live guide has reached its daily limit. Try again tomorrow.', retryable: false };
  mine.push(now); state.clients.set(key, mine); state.global.push(now); state.dayCount++;
  return null;
}

/**
 * Browsers always send Origin on a cross-origin or POST fetch, and a page cannot forge it. Require it to name the same host
 * the request came to. A script outside a browser can set any Origin, so this stops other websites, not scripts. The caps above are the real limit.
 */
export function sameOrigin(origin: string | null, host: string | null, forwardedHost?: string | null): boolean {
  if (!origin) return false;
  let originHost: string;
  try { originHost = new URL(origin).host.toLowerCase(); } catch { return false; }
  const hosts = [host, forwardedHost?.split(',')[0]].map((h) => h?.trim().toLowerCase()).filter(Boolean);
  return hosts.includes(originHost);
}
