import { invalid, respond } from '@/server/core/http.ts';
import { storeMediaUpload } from '@/server/media/media.ts';
import { MAX_MEDIA_REQUEST_BYTES, MEDIA_LIMIT_TEXT } from '@/shared/mediaLimits.ts';

// A rejected upload may leave body bytes unread. `Connection: close` stops a client from reusing that half-read keep-alive socket.
const closing = (response: Response) => { response.headers.set('connection', 'close'); return response; };

export async function POST(req: Request) {
  if (!/^multipart\/form-data(?:\s*;|\s*$)/i.test(req.headers.get('content-type') ?? '')) {
    return closing(invalid(`Send a multipart/form-data body with a video in the file field. ${MEDIA_LIMIT_TEXT}`));
  }
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_MEDIA_REQUEST_BYTES)) {
    return closing(invalid(`The upload body is too large or has an invalid Content-Length. ${MEDIA_LIMIT_TEXT}`));
  }
  const result = await storeMediaUpload(req);
  return result.ok ? respond(result) : closing(respond(result));
}
