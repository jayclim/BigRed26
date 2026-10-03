import { FrameRequestSchema } from '@contracts/schemas.ts';
import { core } from '@/server/core/instance.ts';
import { body, invalid, respond } from '@/server/core/http.ts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const frame = await body(req, FrameRequestSchema);
  if (frame instanceof Response) return frame;
  if (frame.sessionId !== (await params).id) return invalid('Session id in path must match body.');
  return respond(await core.matchFrame(frame));
}
