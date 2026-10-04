import { bounties } from '@/server/bounties/instance.ts';
import { reply } from '@/server/bounties/http.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return reply(await bounties.get((await params).id));
}
