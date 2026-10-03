import { core } from '@/server/core/instance.ts';
import { invalid, respond } from '@/server/core/http.ts';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = new URL(req.url).searchParams.get('version');
  if (v !== null && !/^[1-9]\d*$/.test(v)) return invalid('version must be a positive integer.');
  return respond(await core.getRoute((await params).id, v === null ? undefined : Number(v)));
}
