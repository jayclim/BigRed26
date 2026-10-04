// POST /api/agent/message: the Photon/Spectrum process posts each iMessage here. Gated, secret-protected, rate limited.
// The reply and links come from our code; Grok only picks among approved route ids.
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CoreAdapter } from '../../../contracts/contracts.ts';
import { invalid } from '../core/http.ts';
import { baseUrlFor, createMemory, handleMessage, type Memory } from './conversation.ts';
import { MAX_TEXT, type MatcherConfig, type MatcherDeps } from './routeMatcher.ts';

export const MAX_BODY_BYTES = 4096;
export const SECRET_HEADER = 'x-breadcrumb-agent-secret';
export const PER_MINUTE = 6; // per conversation
export const PER_HOUR = 60; // per conversation
export const GLOBAL_PER_MINUTE = 60; // all conversations: bounds Grok spend
const MAX_TRACKED = 1000;
const MINUTE = 60_000, HOUR = 3_600_000;

export const MessageSchema = z.object({
  conversationId: z.string().min(1).max(200).refine((s) => /\S/u.test(s) && !/[\u0000-\u001f\u007f]/u.test(s), 'conversationId must be plain text.'),
  text: z.string().max(MAX_TEXT, `text must be at most ${MAX_TEXT} characters.`).refine((s) => /\S/u.test(s), 'text must not be empty.'),
}).strict();

export interface AgentConfig extends MatcherConfig { enabled?: string; secret?: string; publicUrl?: string; allowLocalHttp?: boolean }
export const agentConfig = (): AgentConfig => ({ enabled: process.env.BREADCRUMB_AGENT, apiKey: process.env.XAI_API_KEY, model: process.env.XAI_MODEL,
  secret: process.env.BREADCRUMB_AGENT_SECRET, publicUrl: process.env.BREADCRUMB_PUBLIC_URL });
// Links need a public https URL, so a missing or invalid BREADCRUMB_PUBLIC_URL counts as not configured. allowLocalHttp is for tests only (never read from env).
export const agentEnabled = (c: AgentConfig = agentConfig()) => c.enabled === '1' && !!c.apiKey && !!c.secret && baseUrlFor(c.publicUrl, c.allowLocalHttp) !== null;

export interface RateState { global: number[]; conversations: Map<string, number[]> }
export const createRateState = (): RateState => ({ global: [], conversations: new Map() });
const recent = (times: number[], now: number, ms: number) => { let n = 0; for (let i = times.length - 1; i >= 0 && times[i] > now - ms; i--) n++; return n; };
/** Records one request and returns true, or returns false and records nothing. Synchronous, so it cannot interleave. */
export function allow(state: RateState, conversation: string, now: number): boolean {
  while (state.global.length && state.global[0] <= now - MINUTE) state.global.shift();
  for (const [key, times] of state.conversations) {
    while (times.length && times[0] <= now - HOUR) times.shift();
    if (!times.length) state.conversations.delete(key);
  }
  const key = state.conversations.has(conversation) || state.conversations.size < MAX_TRACKED ? conversation : 'overflow';
  const mine = state.conversations.get(key) ?? [];
  if (recent(mine, now, MINUTE) >= PER_MINUTE || mine.length >= PER_HOUR || state.global.length >= GLOBAL_PER_MINUTE) return false;
  mine.push(now); state.conversations.set(key, mine); state.global.push(now);
  return true;
}

const digest = (s: string) => createHash('sha256').update(s).digest();
/** Constant-time compare of two secrets of any length (both are hashed first). */
export const secretMatches = (given: string | null, expected: string) => !!given && timingSafeEqual(digest(given), digest(expected));

const noStore = { 'cache-control': 'private, no-store' };
const fail = (status: number, message: string) =>
  Response.json({ ok: false, error: { code: status === 429 ? 'RATE_LIMITED' : status === 503 ? 'PROVIDER_UNAVAILABLE' : 'INVALID_INPUT', message, retryable: status === 429 || status === 503 } }, { status, headers: noStore });

export interface AgentDeps extends MatcherDeps { config?: AgentConfig; memory?: Memory; rate?: RateState; now?: () => number }
const shared = globalThis as unknown as { breadcrumbAgent?: { memory: Memory; rate: RateState } };
const state = () => (shared.breadcrumbAgent ??= { memory: createMemory(), rate: createRateState() });

export async function agentMessagePost(req: Request, core: Pick<CoreAdapter, 'listRoutes' | 'getRoute'>, deps: AgentDeps = {}) {
  const config = deps.config ?? agentConfig();
  if (!agentEnabled(config)) return fail(503, 'Agent is not enabled.');
  const given = req.headers.get(SECRET_HEADER);
  if (!given) return fail(401, 'Missing agent secret.');
  if (!secretMatches(given, config.secret!)) return fail(403, 'Wrong agent secret.');
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return invalid('Body is too large.');
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return invalid('Body is too large.');
  let json: unknown;
  try { json = JSON.parse(raw); } catch { return invalid('Body must be JSON.'); }
  const parsed = MessageSchema.safeParse(json);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? 'Invalid body.');
  const { conversationId, text } = parsed.data;
  const mine = { memory: deps.memory ?? state().memory, rate: deps.rate ?? state().rate };
  const now = deps.now ?? Date.now;
  if (!allow(mine.rate, conversationId, now())) return fail(429, 'Too many messages. Wait a minute and retry.');
  const result = await handleMessage(conversationId, text, {
    core, memory: mine.memory, now, config: { apiKey: config.apiKey, model: config.model }, fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs,
    baseUrl: baseUrlFor(config.publicUrl, config.allowLocalHttp)!,
  });
  return Response.json({ ok: true, reply: result.reply, routeId: result.routeId, links: result.links, matcher: result.matcher }, { headers: noStore });
}
