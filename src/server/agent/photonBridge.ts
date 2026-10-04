// Pure helpers for scripts/photon-agent.mjs: read config, forward one iMessage text to POST /api/agent/message, return the reply.
// No Spectrum import here, so the checks run without credentials or network.
import { createHmac } from 'node:crypto';

export const DEFAULT_AGENT_URL = 'http://127.0.0.1:3012/api/agent/message';
export const SECRET_HEADER = 'x-breadcrumb-agent-secret';
export const MAX_REPLY_CHARS = 1200;
export const FORWARD_TIMEOUT_MS = 15_000;
export const UNAVAILABLE = 'Breadcrumb is not available right now. Please try again in a minute.';
export const BUSY = 'You are sending messages too fast. Please wait a minute and try again.';

export interface BridgeConfig { projectId: string; projectSecret: string; agentUrl: string; secret: string }
export type BridgeConfigResult = { ok: true; config: BridgeConfig } | { ok: false; missing: string[] };

/** Names of missing variables only; values never appear in a message. */
export function loadBridgeConfig(env: Record<string, string | undefined> = process.env): BridgeConfigResult {
  const projectId = env.SPECTRUM_PROJECT_ID?.trim(), projectSecret = env.SPECTRUM_PROJECT_SECRET?.trim(), secret = env.BREADCRUMB_AGENT_SECRET?.trim();
  const missing = [['SPECTRUM_PROJECT_ID', projectId], ['SPECTRUM_PROJECT_SECRET', projectSecret], ['BREADCRUMB_AGENT_SECRET', secret]]
    .filter(([, v]) => !v).map(([k]) => k as string);
  if (missing.length || !projectId || !projectSecret || !secret) return { ok: false, missing };
  return { ok: true, config: { projectId, projectSecret, secret, agentUrl: env.BREADCRUMB_AGENT_URL?.trim() || DEFAULT_AGENT_URL } };
}

/** The Spectrum space id can hold a phone number. The server only needs a stable key, so send a keyed hash (HMAC-SHA256).
 *  Without the secret nobody can test guessed phone numbers against it. */
export const conversationKey = (spaceId: string, secret: string) => createHmac('sha256', secret).update(spaceId).digest('hex').slice(0, 32);

export const BUSY_WINDOW_MS = 60_000;
const MAX_BUSY_TRACKED = 1000;
/** Conversation key -> time of the last BUSY reply. A sender who floods gets one BUSY per window, then silence. */
export type BusyState = Map<string, number>;
export const createBusyState = (): BusyState => new Map();

export interface ForwardOptions { fetchImpl?: typeof fetch; log?: (line: string) => void; busy?: BusyState; now?: () => number }

/** The reply text, or null when nothing should be sent (a rate-limited sender already told to wait). */
export async function forward(config: BridgeConfig, spaceId: string, text: string, options: ForwardOptions = {}): Promise<string | null> {
  const { fetchImpl = fetch, log = console.error, busy = createBusyState(), now = Date.now } = options;
  const key = conversationKey(spaceId, config.secret);
  const t = now();
  try {
    const response = await fetchImpl(config.agentUrl, {
      method: 'POST', signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: config.secret },
      body: JSON.stringify({ conversationId: key, text: text.slice(0, 500) }),
    });
    if (response.status === 429) {
      void response.body?.cancel().catch(() => {});
      for (const [k, at] of busy) if (at <= t - BUSY_WINDOW_MS) busy.delete(k);
      if (busy.has(key)) return null; // already told to wait in this window
      if (busy.size >= MAX_BUSY_TRACKED) busy.delete(busy.keys().next().value as string);
      busy.set(key, t);
      return BUSY;
    }
    if (!response.ok) { void response.body?.cancel().catch(() => {}); log(`[photon-agent] Endpoint returned HTTP ${response.status}.`); return UNAVAILABLE; }
    busy.delete(key);
    const body = (await response.json()) as { ok?: unknown; reply?: unknown };
    if (body.ok === true && typeof body.reply === 'string' && body.reply.trim()) return body.reply.slice(0, MAX_REPLY_CHARS);
    log('[photon-agent] Endpoint answered with an unexpected body.');
    return UNAVAILABLE;
  } catch (error) { log(`[photon-agent] Endpoint call failed: ${error instanceof Error ? error.name : 'error'}.`); return UNAVAILABLE; }
}
