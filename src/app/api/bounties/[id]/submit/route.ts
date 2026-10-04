import { bounties } from '@/server/bounties/instance.ts';
import { client, readJson, reply } from '@/server/bounties/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  return reply(await bounties.submit((await params).id, input, client(req)));
}
