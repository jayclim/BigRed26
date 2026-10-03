import { RouteSchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { body, invalid, respond } from '@/server/core/http.ts';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const route = await body(req, RouteSchema);
  if (route instanceof Response) return route;
  if (route.id !== (await params).id) return invalid('Route id in path must match body.');
  return respond(await core.saveDraft(route));
}
