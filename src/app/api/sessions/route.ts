import { StartSessionBodySchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { body, respond } from '@/server/core/http.ts';

export async function POST(req: Request) {
  const b = await body(req, StartSessionBodySchema);
  if (b instanceof Response) return b;
  return respond(await core.startSession(b.routeId, b.locale, b.mode));
}
