import { respond } from '../../../../server/core/http.ts';
import { loadAudio } from '../../../../server/voice/voice.ts';
export const runtime = 'nodejs';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await loadAudio((await params).id);
  if (!result.ok) return respond(result);
  return new Response(new Uint8Array(result.value.bytes), { headers: {
    'content-type': result.value.contentType, 'content-length': String(result.value.bytes.byteLength),
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
