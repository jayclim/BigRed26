import { respond } from '../../../server/core/http.ts';
import { speechBody, synthesize } from '../../../server/voice/voice.ts';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const body = await speechBody(req);
  return respond(body.ok ? await synthesize(body.value) : body);
}
