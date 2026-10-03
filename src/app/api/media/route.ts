import { invalid, respond } from '@/server/core/http.ts';
import { storeMedia } from '@/server/media/media.ts';
import { MAX_MEDIA_REQUEST_BYTES, MEDIA_LIMIT_TEXT } from '@/shared/mediaLimits.ts';

export async function POST(req: Request) {
  if (!/^multipart\/form-data(?:\s*;|\s*$)/i.test(req.headers.get('content-type') ?? '')) {
    return invalid(`Send a multipart/form-data body with a video in the file field. ${MEDIA_LIMIT_TEXT}`);
  }
  const length = req.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_MEDIA_REQUEST_BYTES)) {
    return invalid(`The upload body is too large or has an invalid Content-Length. ${MEDIA_LIMIT_TEXT}`);
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return invalid(`The multipart upload could not be read. Choose the video again. ${MEDIA_LIMIT_TEXT}`); }
  const file = form.get('file');
  if (!(file instanceof File)) return invalid(`The file field must contain a video. ${MEDIA_LIMIT_TEXT}`);
  return respond(await storeMedia(file));
}
