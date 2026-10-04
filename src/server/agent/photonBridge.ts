// Pure helpers for scripts/photon-agent.mjs: read config, forward one iMessage text to POST /api/agent/message, return the reply.
// No Spectrum import here, so the checks run without credentials or network.
import { createHash } from 'node:crypto';

export const DEFAULT_AGENT_URL = 'http://127.0.0.1:3000/api/agent/message';
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

/** The Spectrum space id can hold a phone number. The server only needs a stable key, so send a hash. */
export const conversationKey = (spaceId: string) => createHash('sha256').update(spaceId).digest('hex').slice(0, 32);

export async function forward(config: BridgeConfig, spaceId: string, text: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetchImpl(config.agentUrl, {
      method: 'POST', signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: config.secret },
      body: JSON.stringify({ conversationId: conversationKey(spaceId), text: text.slice(0, 500) }),
    });
    if (response.status === 429) return BUSY;
    if (!response.ok) return UNAVAILABLE;
    const body = (await response.json()) as { ok?: unknown; reply?: unknown };
    return body.ok === true && typeof body.reply === 'string' && body.reply.trim() ? body.reply.slice(0, MAX_REPLY_CHARS) : UNAVAILABLE;
  } catch { return UNAVAILABLE; }
}
