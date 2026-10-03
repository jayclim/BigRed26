import { ManualCompletionBodySchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { body, respond } from '@/server/core/http.ts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const b = await body(req, ManualCompletionBodySchema);
  if (b instanceof Response) return b;
  return respond(await core.completeAction((await params).id, b));
}
