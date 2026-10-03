import { invalid, respond } from '../core/http.ts';
import { saveFrame } from './frames.ts';
import { MAX_FRAME_BYTES } from '../../features/guide/frameCapture.ts';
import type { CoreAdapter } from '../../../contracts/contracts.ts';

export async function receiveFrame(req: Request, core: Pick<CoreAdapter, 'getSession'>, directory?: string) {
  if (req.headers.get('content-type')?.toLowerCase() !== 'image/jpeg') return invalid('Content-Type must be image/jpeg.');
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_FRAME_BYTES)) return invalid('Invalid or oversized Content-Length.');
  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (!sessionId) return invalid('sessionId is required.');
  const session = await core.getSession(sessionId);
  if (!session.ok) return respond(session);
  if (session.value.id !== sessionId) return respond({ ok: false, error: { code: 'NOT_FOUND', message: 'Session not found.', retryable: false } });
  // Count streamed bytes before buffering. Chunked bodies also obey the cap.
  const reader = req.body?.getReader();
  if (!reader) return invalid('Frame body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FRAME_BYTES) { await reader.cancel(); return invalid('Frame exceeds the byte limit.'); }
      chunks.push(value);
    }
  } catch { return invalid('Frame body could not be read.'); }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return respond(await saveFrame(bytes, directory));
}
