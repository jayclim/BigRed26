import { core } from '@/server/core/instance.ts';
import { respond } from '@/server/core/http.ts';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(await core.reserveFrameSequence((await params).id));
}
