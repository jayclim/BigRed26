import type { CoreAdapter } from '../../../contracts/contracts.ts';
import { invalid, respond } from '../core/http.ts';
import { MAX_BODY_BYTES, liveEnabled, mintLiveToken, type LiveTokenDeps } from './liveGuide.ts';

const noStore = { 'cache-control': 'private, no-store' };
const withHeaders = (response: Response) => { for (const [k, v] of Object.entries(noStore)) response.headers.set(k, v); return response; };

export async function liveTokenPost(req: Request, core: Pick<CoreAdapter, 'getRoute'>, deps: Partial<LiveTokenDeps> = {}) {
  if (!liveEnabled(deps.config)) return withHeaders(respond(await mintLiveToken({}, { core, ...deps }))); // 503 before any body work
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return invalid('Body is too large.');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return invalid('Body is too large.');
  let json: unknown;
  try { json = JSON.parse(text); } catch { return invalid('Body must be JSON.'); }
  return withHeaders(respond(await mintLiveToken(json, { core, ...deps })));
}
/** Capability probe: a boolean only, never keys. */
export const liveTokenProbe = (deps: Partial<LiveTokenDeps> = {}) =>
  Response.json({ ok: true, value: { enabled: liveEnabled(deps.config) } }, { headers: noStore });
