// Small on purpose: the classic guide page imports this, and it must not pull in the live session code.
import type { Result } from '@contracts/contracts.ts';

/** True only when the server reports the live voice guide as enabled. Any failure means false. */
export async function liveGuideEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/live/token', { cache: 'no-store' });
    const json = await res.json() as Result<{ enabled: boolean }>;
    return res.ok && json.ok && json.value.enabled === true;
  } catch { return false; }
}
