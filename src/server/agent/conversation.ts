// One text message in, one reply out. Holds tiny per-conversation memory so "2" or a name can pick from a numbered list.
// ponytail: memory and rate limits are in process. Two server instances would not share them.
import type { CoreAdapter } from '../../../contracts/contracts.ts';
import { clean, keywordMatch, loadCatalog, matchRoute, MAX_CANDIDATES, MAX_TEXT, type CatalogRoute, type MatcherDeps } from './routeMatcher.ts';

export const MEMORY_TTL_MS = 10 * 60_000;
export const MAX_CONVERSATIONS = 500;
export const LIST_LIMIT = 5;
export interface Links { stream: string; classic: string }
export interface AgentReply { reply: string; routeId: string | null; links: Links | null; matcher: 'grok' | 'keyword' | 'memory' | 'none' }
export interface Memory { map: Map<string, { routeIds: string[]; at: number }> }
export const createMemory = (): Memory => ({ map: new Map() });

/** Links are built only here, from an id that exists and is approved. The model never writes them. */
export function buildLinks(baseUrl: string, routeId: string): Links {
  const path = `/follow/${encodeURIComponent(routeId)}`;
  return { stream: `${baseUrl}${path}?mode=stream`, classic: `${baseUrl}${path}` };
}

/** The configured public URL as `origin + path`, or null. It must be an absolute https URL with no credentials, query or fragment.
 *  http is accepted only for loopback hosts and only when `allowLocalHttp` is set (tests). There is no fallback to the request origin:
 *  behind the Photon bridge that origin is loopback, and a link to it cannot be opened on a phone. Never returns a trailing slash. */
export function baseUrlFor(configured: string | undefined, allowLocalHttp = false): string | null {
  const candidate = configured?.trim();
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    if (u.username || u.password || u.search || u.hash) return null;
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol !== 'https:' && !(allowLocalHttp && loopback && u.protocol === 'http:')) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch { return null; }
}

const label = (r: CatalogRoute) => (r.destination && r.destination !== r.name ? `${r.name} (to ${r.destination})` : r.name);
const numbered = (routes: CatalogRoute[]) => routes.map((r, i) => `${i + 1}. ${label(r)}`).join('\n');
const pickNumber = (text: string) => /^\s*#?\s*([1-9])\s*[.)!]?\s*$/u.exec(text)?.[1];

function found(route: CatalogRoute, baseUrl: string, lead: string | null, matcher: AgentReply['matcher']): AgentReply {
  const links = buildLinks(baseUrl, route.id);
  const reply = [`${lead ?? `Route to ${label(route)}.`}`, `Live voice guide: ${links.stream}`, `Classic guide: ${links.classic}`].join('\n');
  return { reply, routeId: route.id, links, matcher };
}

export interface HandleDeps extends MatcherDeps { core: Pick<CoreAdapter, 'listRoutes' | 'getRoute'>; memory: Memory; baseUrl: string; now?: () => number }

export async function handleMessage(conversationId: string, rawText: string, deps: HandleDeps): Promise<AgentReply> {
  const now = (deps.now ?? Date.now)();
  const text = clean(rawText, MAX_TEXT);
  const catalog = await loadCatalog(deps.core);
  if (!catalog.ok) return { reply: 'Routes are unavailable right now. Try again in a minute.', routeId: null, links: null, matcher: 'none' };
  const routes = catalog.value;
  const byId = new Map(routes.map((r) => [r.id, r]));
  if (!routes.length) return { reply: 'No routes are ready yet. Ask the route owner to approve one.', routeId: null, links: null, matcher: 'none' };

  // Expire old memory and cap its size before use. A map keeps insertion order, so the oldest entry goes first.
  for (const [key, entry] of deps.memory.map) if (entry.at <= now - MEMORY_TTL_MS) deps.memory.map.delete(key);
  const pending = deps.memory.map.get(conversationId);
  if (pending) {
    const slots = pending.routeIds.map((id) => byId.get(id)); // positions stay as shown; an id that lost approval leaves a hole
    const n = pickNumber(text);
    const chosen = n !== undefined ? slots[Number(n) - 1] : (() => {
      const m = keywordMatch(text, slots.filter((r): r is CatalogRoute => !!r)).match;
      return m.kind === 'match' ? byId.get(m.routeId) : undefined;
    })();
    if (chosen) { deps.memory.map.delete(conversationId); return found(chosen, deps.baseUrl, null, 'memory'); }
  }

  const result = await matchRoute(text, routes, deps);
  deps.memory.map.delete(conversationId);
  const remember = (routeIds: string[]) => {
    deps.memory.map.set(conversationId, { routeIds, at: now });
    while (deps.memory.map.size > MAX_CONVERSATIONS) deps.memory.map.delete(deps.memory.map.keys().next().value as string);
  };
  if (result.match.kind === 'match') return found(byId.get(result.match.routeId)!, deps.baseUrl, result.lead, result.matcher);
  if (result.match.kind === 'ambiguous') {
    const options = result.match.routeIds.slice(0, MAX_CANDIDATES).map((id) => byId.get(id)!);
    remember(options.map((r) => r.id));
    return { reply: `${result.lead ?? 'Which one do you mean?'}\n${numbered(options)}\nReply with the number or the name.`, routeId: null, links: null, matcher: result.matcher };
  }
  const list = routes.slice(0, LIST_LIMIT);
  remember(list.map((r) => r.id)); // "2" after the list picks from it
  return { reply: `I could not find that destination. Available:\n${numbered(list)}${routes.length > list.length ? `\n…and ${routes.length - list.length} more.` : ''}\nTell me where you want to go.`, routeId: null, links: null, matcher: result.matcher };
}
