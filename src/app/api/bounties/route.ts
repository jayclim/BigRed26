import { bounties } from '@/server/bounties/instance.ts';
import { client, readJson, reply } from '@/server/bounties/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return reply(await bounties.board());
}

export async function POST(req: Request) {
  const input = await readJson(req);
  if (input instanceof Response) return input;
  return reply(await bounties.create(input, client(req)));
}
