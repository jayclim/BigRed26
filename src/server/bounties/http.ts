// HTTP glue for /api/bounties: size-capped JSON bodies, the Result envelope, and the client key for rate limits.
import { clientKey } from './limits.ts';
import type { BountyCode, Out } from './service.ts';

export const MAX_BODY_BYTES = 2048;
const STATUS: Record<BountyCode, number> = {
  INVALID_INPUT: 400, FORBIDDEN: 403, NOT_FOUND: 404, NOT_APPROVED: 409, CONFLICT: 409, RATE_LIMITED: 429, PROVIDER_UNAVAILABLE: 503,
};
const headers = { 'cache-control': 'private, no-store' };

export const reply = <T,>(r: Out<T>) => Response.json(r, { status: r.ok ? 200 : STATUS[r.error.code], headers });
export const bad = (message: string) => reply({ ok: false, error: { code: 'INVALID_INPUT', message, retryable: false } });
export const client = (req: Request) => clientKey(req.headers.get('x-forwarded-for'));

/** Reads a small JSON body. Returns the parsed value, or a Response when the body is too large or not JSON. */
export async function readJson(req: Request): Promise<unknown | Response> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return bad('Body is too large.');
  let raw: string;
  try { raw = await req.text(); } catch { return bad('Body must be JSON.'); }
  if (raw.length > MAX_BODY_BYTES) return bad('Body is too large.');
  try { return JSON.parse(raw); } catch { return bad('Body must be JSON.'); }
}
