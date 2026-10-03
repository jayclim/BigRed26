import { ModeSchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { invalid, respond } from '@/server/core/http.ts';

// Default mode is live, per integration.txt: mock/replay metrics must be requested explicitly.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const q = new URL(req.url).searchParams;
  const version = Number(q.get('version'));
  const since = q.get('since') ?? new Date(0).toISOString();
  const mode = ModeSchema.safeParse(q.get('mode') ?? 'live');
  if (!Number.isInteger(version) || version < 1) return invalid('version must be a positive integer.');
  if (Number.isNaN(Date.parse(since))) return invalid('since must be an ISO date.');
  if (!mode.success) return invalid('mode must be live, replay or mock.');
  return respond(await core.routeQuality((await params).id, version, new Date(since).toISOString(), mode.data));
}
