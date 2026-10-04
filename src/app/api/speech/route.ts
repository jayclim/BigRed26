import { respond } from '../../../server/core/http.ts';
import { speechBody, synthesize, voiceEnabled } from '../../../server/voice/voice.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // the probe reads server env per request, never at build time
export async function POST(req: Request) {
  const body = await speechBody(req);
  return respond(body.ok ? await synthesize(body.value) : body);
}
// Capability probe only: a boolean, never keys. The guide uses it to pick generated or labeled browser speech.
export async function GET() {
  return Response.json({ ok: true, value: { enabled: voiceEnabled() } }, { headers: { 'cache-control': 'no-store' } });
}
