import type { ErrorCode, Result } from '../../../contracts/contracts.ts';
import type { z } from 'zod';

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400, NOT_FOUND: 404, NOT_APPROVED: 409, STALE_VERSION: 409,
  STALE_FRAME: 409, RATE_LIMITED: 429, PROVIDER_UNAVAILABLE: 503,
};

export const respond = <T>(r: Result<T>) => Response.json(r, { status: r.ok ? 200 : STATUS[r.error.code] });

export const invalid = (message: string) => respond({ ok: false, error: { code: 'INVALID_INPUT', message, retryable: false } });

/** Parses a JSON body against a schema; returns a Response on failure. */
export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S> | Response> {
  let json: unknown;
  try { json = await req.json(); } catch { return invalid('Body must be JSON.'); }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : invalid(parsed.error.issues[0]?.message ?? 'Invalid body.');
}
