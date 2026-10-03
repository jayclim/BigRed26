import type { Id, Result } from '../../contracts/contracts.ts';

export async function uploadFrame(sessionId: Id, blob: Blob, signal?: AbortSignal): Promise<Result<{ mediaId: Id }>> {
  try {
    const response = await fetch(`/api/frames?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob, signal, cache: 'no-store',
    });
    try { return await response.json() as Result<{ mediaId: Id }>; }
    catch { return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: `Unexpected ${response.status} response from frame upload.`, retryable: true } }; }
  } catch {
    return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: "Can't reach the Breadcrumb server.", retryable: true } };
  }
}
