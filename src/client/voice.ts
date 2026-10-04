import type { Result, SpeechClip, VoiceAdapter } from '../../contracts/contracts.ts';
export const httpVoice: VoiceAdapter = {
  async synthesize(request) {
    let res: Response;
    try {
      res = await fetch('/api/speech', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request), cache: 'no-store' });
    } catch {
      return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: "Can't reach the Breadcrumb server.", retryable: true } };
    }
    try { return await res.json() as Result<SpeechClip>; }
    catch { return { ok: false, error: { code: res.status === 404 ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE',
      message: `Unexpected ${res.status} response from /api/speech.`, retryable: res.status >= 500 } }; }
  },
};

/** True only when the server reports generated voice enabled. Any failure means false, so the guide keeps browser speech. */
export async function serverVoiceEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/speech', { cache: 'no-store' });
    const json = await res.json() as Result<{ enabled: boolean }>;
    return res.ok && json.ok && json.value.enabled === true;
  } catch { return false; }
}
