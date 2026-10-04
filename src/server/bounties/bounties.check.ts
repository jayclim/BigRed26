// Run with `npm run check`. Fake fetch and fake route list only: no network, no real key, no real data file.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RouteSummary } from '../../../contracts/contracts.ts';
import { createNessieClient } from '../nessie/client.ts';
import { bountyConfig, type BountyConfig } from './config.ts';
import { GLOBAL_POSTS_PER_HOUR, RULES, allow, clientKey, createLimiter } from './limits.ts';
import { MAX_ACTIVE, createBountyService, hashSecret, secretMatches, type Out } from './service.ts';
import { loadBounties, persistBounties } from './store.ts';
import { STATUSES, TRANSITIONS, canMove, type Bounty } from './types.ts';

const KEY = 'bounty-test-key-DO-NOT-LEAK';
const FUND = 'f'.repeat(24), CREATOR = 'c'.repeat(24), MADE = 'd'.repeat(24), CUST = 'e'.repeat(24);
const config: BountyConfig = { enabled: true, apiKey: KEY, fundingAccountId: FUND, baseUrl: 'https://nessie.test', maxRewardUsd: 50, payoutMode: 'auto' };
const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-bounties-check-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true })); // only this run's own temp dir

// ---- Config gate and caps ----
{
  assert.equal(bountyConfig({}).enabled, false);
  const env = { BREADCRUMB_BOUNTIES: '1', NESSIE_API_KEY: 'k', NESSIE_FUNDING_ACCOUNT_ID: FUND };
  assert.equal(bountyConfig(env).enabled, true);
  for (const drop of Object.keys(env)) assert.equal(bountyConfig({ ...env, [drop]: undefined }).enabled, false, drop);
  assert.equal(bountyConfig({ ...env, BREADCRUMB_BOUNTIES: 'true' }).enabled, false);
  assert.equal(bountyConfig({ ...env, NESSIE_FUNDING_ACCOUNT_ID: '../x' }).enabled, false);
  assert.equal(bountyConfig(env).maxRewardUsd, 50);
  assert.equal(bountyConfig({ ...env, BREADCRUMB_BOUNTY_MAX: '20' }).maxRewardUsd, 20);
  for (const junk of ['0', '-5', '1.5', 'abc', '']) assert.equal(bountyConfig({ ...env, BREADCRUMB_BOUNTY_MAX: junk }).maxRewardUsd, 50, junk);
  assert.equal(bountyConfig(env).payoutMode, 'auto');
  assert.equal(bountyConfig({ ...env, NESSIE_PAYOUT_MODE: 'ledger' }).payoutMode, 'ledger');
  assert.equal(bountyConfig({ ...env, NESSIE_BASE_URL: 'ftp://x' }).baseUrl, 'https://api.nessieisreal.com');
  assert.equal(bountyConfig({ ...env, NESSIE_BASE_URL: 'http://api.reimaginebanking.com/' }).baseUrl, 'http://api.reimaginebanking.com');
}

// ---- State machine ----
{
  const allowed = (from: string) => Object.entries(TRANSITIONS).find(([k]) => k === from)![1];
  assert.deepEqual([...allowed('paid')], []); assert.deepEqual([...allowed('cancelled')], []);
  assert.ok(canMove('open', 'claimed') && canMove('claimed', 'submitted') && canMove('submitted', 'paying') && canMove('paying', 'paid'));
  assert.ok(canMove('paying', 'submitted') && canMove('submitted', 'claimed'));
  for (const bad of [['open', 'paid'], ['open', 'submitted'], ['claimed', 'paid'], ['claimed', 'paying'], ['submitted', 'paid'], ['paid', 'cancelled'], ['paying', 'cancelled'], ['cancelled', 'open'], ['paid', 'open']] as const)
    assert.equal(canMove(bad[0], bad[1]), false, bad.join('->'));
  assert.equal(STATUSES.length, 6);
}

// ---- Rate limits ----
{
  assert.equal(clientKey('1.1.1.1, 2.2.2.2, 9.9.9.9'), '9.9.9.9'); // the proxy appended the address it saw
  assert.equal(clientKey(null), 'unknown');
  const l = createLimiter();
  for (let i = 0; i < RULES.post.perMinute; i++) assert.ok(allow(l, 'post', 'a', 1000 + i));
  assert.equal(allow(l, 'post', 'a', 2000), false);
  assert.ok(allow(l, 'post', 'b', 2000)); // other clients are unaffected
  assert.ok(allow(l, 'claim', 'a', 2000)); // other kinds are unaffected
  assert.ok(allow(l, 'post', 'a', 1000 + 61_000)); // the minute window slides
  const g = createLimiter();
  for (let i = 0; i < GLOBAL_POSTS_PER_HOUR; i++) assert.ok(allow(g, 'post', `c${i}`, 5000 + i));
  assert.equal(allow(g, 'post', 'late', 6000), false); // global post cap holds across clients
  const h = createLimiter();
  let t = 0, granted = 0;
  for (let i = 0; i < 20; i++) { t += 61_000; if (allow(h, 'post', 'h', t)) granted++; } // one per minute, 20 minutes
  assert.equal(granted, RULES.post.perHour); // hourly cap holds
}

// ---- Store safe loading ----
{
  const f = join(dir, 'b.json');
  const missing = loadBounties(f); assert.ok(missing.ok && missing.fresh && missing.bounties.length === 0);
  const sample = (id: string): Bounty => ({
    id, title: 't', description: 'd', poster: 'p', rewardUsd: 5, status: 'open', createdAt: 'now', posterSecretHash: hashSecret('s'),
    claim: null, routeId: null, routeName: null, routeVersion: null, submittedAt: null, payout: null,
  });
  persistBounties(f, [sample('a'), sample('b')]);
  const back = loadBounties(f); assert.ok(back.ok && !back.fresh && back.bounties.length === 2);
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), []);
  const bad: Array<[string, string]> = [['not json', '{nope'], ['wrong shape', '{"hello":1}'], ['array root', '[]'],
    ['bad status', JSON.stringify({ version: 1, bounties: [{ ...sample('a'), status: 'refunded' }] })],
    ['bad hash', JSON.stringify({ version: 1, bounties: [{ ...sample('a'), posterSecretHash: 'plaintext-secret' }] })],
    ['duplicate ids', JSON.stringify({ version: 1, bounties: [sample('a'), sample('a')] })],
    ['fractional reward', JSON.stringify({ version: 1, bounties: [{ ...sample('a'), rewardUsd: 1.5 }] })]];
  for (const [label, text] of bad) {
    writeFileSync(f, text);
    const r = loadBounties(f); assert.equal(r.ok, false, label);
    assert.equal(readFileSync(f, 'utf8'), text, `${label}: file left untouched`);
  }
  const dirAsFile = loadBounties(dir); assert.equal(dirAsFile.ok, false); assert.ok(existsSync(dir)); // unreadable path: reported, not treated as empty
}

// ---- Fake Nessie behind a fake fetch ----
interface Req { method: string; path: string; body: Record<string, unknown> | null }
type Handler = (r: Req) => Response | Promise<Response> | undefined;
const created = (id: string) => Response.json({ code: 201, message: 'Created', objectCreated: { _id: id } }, { status: 201 });
const HANG = new Response('hang'); // sentinel
const refuse = (message = 'nope') => Response.json({ code: 400, message }, { status: 400 });
function world(overrides: Partial<{ config: Partial<BountyConfig>; persistThrows: () => boolean }> = {}) {
  const reqs: Req[] = [];
  let next: Handler[] = []; // one-shot overrides, consumed in order
  const before: { fn: Handler | null } = { fn: null };
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    assert.equal(u.searchParams.get('key'), KEY);
    const r: Req = { method: init.method ?? 'GET', path: u.pathname, body: init.body ? JSON.parse(init.body as string) : null };
    reqs.push(r);
    const custom = next.shift()?.(r) ?? before.fn?.(r);
    if (custom === HANG) return new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason))); // never answers; only the client timeout ends it
    if (custom) return custom;
    if (r.method === 'GET') return Response.json({ _id: r.path.split('/').at(-1), type: 'Checking', nickname: 'x', balance: 1000 });
    if (r.path === '/customers') return created(CUST);
    if (r.path.endsWith('/accounts')) return created(MADE);
    return created(`${r.path.split('/').at(-1)![0].repeat(5)}${String(reqs.length).padStart(19, '0')}`);
  }) as unknown as typeof fetch;
  let routes: RouteSummary[] = [
    { id: 'approved-route', name: 'Clark to AEP', latestVersion: 2, latestStatus: 'approved', approvedVersion: 2, checkpointCount: 3, destinationLabel: 'AEP 269' },
    { id: 'other-approved', name: 'Other', latestVersion: 1, latestStatus: 'approved', approvedVersion: 1, checkpointCount: 3, destinationLabel: 'X' },
    { id: 'draft-route', name: 'Draft', latestVersion: 1, latestStatus: 'draft', approvedVersion: null, checkpointCount: 3, destinationLabel: 'X' },
  ];
  let stored: Bounty[] = [];
  let saves = 0;
  const limiter = createLimiter();
  const cfg = { ...config, ...overrides.config };
  const build = (existing: Bounty[] = stored) => createBountyService({
    bounties: structuredClone(existing), config: cfg, limiter, now: () => 1_700_000_000_000 + saves,
    persist: (all) => { if (overrides.persistThrows?.()) throw Object.assign(new Error('disk'), { code: 'ENOSPC' }); stored = structuredClone(all); saves++; },
    nessie: cfg.enabled ? createNessieClient({ apiKey: KEY, baseUrl: cfg.baseUrl, fetchImpl, timeoutMs: 100, now: () => new Date('2023-11-14T12:00:00Z') }) : null,
    core: { listRoutes: async () => ({ ok: true, value: routes }) },
    newId: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })(),
  });
  return {
    svc: build(), build, reqs, cfg, limiter,
    once: (...h: Handler[]) => { next = h; },
    always: (fn: Handler | null) => { before.fn = fn; },
    setRoutes: (r: RouteSummary[]) => { routes = r; },
    stored: () => stored,
    moneyCalls: () => reqs.filter((r) => r.method === 'POST' && /\/(transfers|withdrawals|deposits)$/.test(r.path)),
  };
}
const v = <T,>(r: Out<T>): T => { assert.ok(r.ok, r.ok ? '' : r.error.message); return (r as { ok: true; value: T }).value; };
const err = <T,>(r: Out<T>, code: string) => { assert.equal(r.ok, false, 'expected an error'); if (!r.ok) { assert.equal(r.error.code, code, r.error.message); assert.ok(!JSON.stringify(r).includes(KEY)); } };
const draft = { title: 'Clark Hall lobby to AEP study room 269', description: 'Start at the Clark Hall lobby doors.', poster: 'Pat', rewardUsd: 10 };

/** Posts, claims and submits one bounty; returns the ids and secrets. */
async function toSubmitted(w: ReturnType<typeof world>, over: Partial<typeof draft> = {}) {
  const posted = v(w.svc.create({ ...draft, ...over }, 'p1'));
  const claimed = v(await w.svc.claim(posted.bounty.id, { creatorName: 'Casey', accountId: CREATOR }, 'c1'));
  v(await w.svc.submit(posted.bounty.id, { routeId: 'approved-route', claimSecret: claimed.claimSecret }, 'c1'));
  return { id: posted.bounty.id, posterSecret: posted.posterSecret, claimSecret: claimed.claimSecret };
}

// ---- Read-only without the gate ----
{
  const w = world({ config: { enabled: false } });
  err(w.svc.create(draft, 'x'), 'PROVIDER_UNAVAILABLE');
  const board = v(await w.svc.board());
  assert.deepEqual([board.payments.enabled, board.bounties.length, board.funding], [false, 0, null]);
  assert.equal(w.reqs.length, 0); // no Nessie call when disabled
  err(await w.svc.claim('00000000-0000-4000-8000-000000000001', { creatorName: 'x', accountId: CREATOR }, 'x'), 'PROVIDER_UNAVAILABLE');
}

// ---- Post: validation, caps, secrets ----
{
  const w = world();
  for (const bad of [{ rewardUsd: 0 }, { rewardUsd: -3 }, { rewardUsd: 1.5 }, { rewardUsd: '10' }, { rewardUsd: 51 }, { rewardUsd: 1e9 }, { rewardUsd: null },
    { title: '' }, { title: '   ' }, { title: 'x'.repeat(121) }, { poster: 'a\u0000b' }, { description: 'y'.repeat(601) }, { extra: 1 }, { rewardUsd: undefined }])
    err(w.svc.create({ ...draft, ...bad }, `bad${Math.random()}`), 'INVALID_INPUT');
  err(w.svc.create('nope', 'z'), 'INVALID_INPUT'); err(w.svc.create(null, 'z'), 'INVALID_INPUT');
  assert.equal(v(w.svc.create({ ...draft, rewardUsd: 50 }, 'cap')).bounty.rewardUsd, 50); // the cap itself is allowed
  const lower = world({ config: { maxRewardUsd: 20 } });
  err(lower.svc.create({ ...draft, rewardUsd: 21 }, 'cap'), 'INVALID_INPUT');
  const { bounty, posterSecret } = v(w.svc.create(draft, 'fresh'));
  assert.match(posterSecret, /^bps_[A-Za-z0-9_-]{24}$/);
  assert.equal(bounty.status, 'open');
  const onDisk = JSON.stringify(w.stored());
  assert.ok(!onDisk.includes(posterSecret), 'only a hash is stored');
  assert.ok(onDisk.includes(hashSecret(posterSecret)));
  assert.ok(!JSON.stringify(bounty).includes('Hash') && !JSON.stringify(await w.svc.board()).includes(hashSecret(posterSecret)));
  // Rate limit per client
  const lim = world();
  for (let i = 0; i < RULES.post.perMinute; i++) v(lim.svc.create(draft, 'spam'));
  err(lim.svc.create(draft, 'spam'), 'RATE_LIMITED');
  v(lim.svc.create(draft, 'other'));
  // Active cap
  const full = world();
  for (let i = 0; i < MAX_ACTIVE; i++) { full.limiter.clients.clear(); full.limiter.globalPosts.length = 0; v(full.svc.create(draft, `n${i}`)); } // rate limits reset so only the cap is under test
  full.limiter.clients.clear(); full.limiter.globalPosts.length = 0;
  err(full.svc.create(draft, 'late'), 'CONFLICT');
}

// ---- Secret comparison ----
{
  const h = hashSecret('abc');
  assert.ok(secretMatches('abc', h));
  for (const bad of ['abd', '', 'abc ', undefined, 'a'.repeat(100_000)]) assert.equal(secretMatches(bad as string | undefined, h), false);
}

// ---- Inherited and malformed ids ----
{
  const w = world();
  const real = v(w.svc.create(draft, 'x')).bounty.id;
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '', '../x', 'x'.repeat(1000), `${real}x`, real.toUpperCase().replace(/-/g, '_')]) {
    err(w.svc.get(id), 'NOT_FOUND');
    err(await w.svc.claim(id, { creatorName: 'a', accountId: CREATOR }, 'i'), 'NOT_FOUND');
    err(await w.svc.submit(id, { routeId: 'approved-route', claimSecret: 's' }, 'i'), 'NOT_FOUND');
    err(await w.svc.pay(id, { posterSecret: 's' }, 'i'), 'NOT_FOUND');
    err(w.svc.cancel(id, { posterSecret: 's' }, 'i'), 'NOT_FOUND');
    err(w.svc.reject(id, { posterSecret: 's' }, 'i'), 'NOT_FOUND');
  }
  assert.ok(w.svc.get(real).ok);
  // Inherited route names are not routes either.
  const t = await toSubmitted(world());
  void t;
  const w2 = world();
  const p = v(w2.svc.create(draft, 'x')); const c = v(await w2.svc.claim(p.bounty.id, { creatorName: 'a', accountId: CREATOR }, 'x'));
  for (const routeId of ['__proto__', 'constructor', 'toString', 'missing']) err(await w2.svc.submit(p.bounty.id, { routeId, claimSecret: c.claimSecret }, 'x'), 'NOT_FOUND');
}

// ---- Claim ----
{
  const w = world();
  const { bounty } = v(w.svc.create(draft, 'x'));
  for (const bad of [{}, { creatorName: 'a' }, { creatorName: 'a', accountId: CREATOR, createAccount: true }, { creatorName: 'a', accountId: '../x' }, { creatorName: '', accountId: CREATOR },
    { creatorName: 'a', accountId: FUND }, { creatorName: 'a', accountId: CREATOR, extra: 1 }, 'x', null])
    err(await w.svc.claim(bounty.id, bad, `b${Math.random()}`), 'INVALID_INPUT');
  assert.equal(w.reqs.length, 0, 'bad claims never reach Nessie');
  w.once(() => refuse('not found'));
  err(await w.svc.claim(bounty.id, { creatorName: 'a', accountId: CREATOR }, 'u'), 'INVALID_INPUT'); // unknown Nessie account
  assert.equal(v(w.svc.get(bounty.id)).status, 'open');
  w.once(() => new Response('x', { status: 503 }));
  err(await w.svc.claim(bounty.id, { creatorName: 'a', accountId: CREATOR }, 'u2'), 'PROVIDER_UNAVAILABLE');
  // Two claimants at once: exactly one wins.
  const [a, b] = await Promise.all([
    w.svc.claim(bounty.id, { creatorName: 'Ann', accountId: CREATOR }, 'r1'),
    w.svc.claim(bounty.id, { creatorName: 'Bob', accountId: CREATOR }, 'r2'),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  const win = v(a.ok ? a : b);
  assert.equal(win.bounty.status, 'claimed');
  assert.equal(win.bounty.claim!.accountLast4, 'cccc'); // masked
  assert.ok(!JSON.stringify(win.bounty).includes(CREATOR));
  assert.match(win.claimSecret, /^bcs_/);
  err(await w.svc.claim(bounty.id, { creatorName: 'Late', accountId: CREATOR }, 'r3'), 'CONFLICT');
  // Opening a payout account by name
  const w2 = world();
  const p2 = v(w2.svc.create(draft, 'x'));
  const c2 = v(await w2.svc.claim(p2.bounty.id, { creatorName: 'Grace Hopper', createAccount: true }, 'x'));
  assert.deepEqual(w2.reqs.map((r) => `${r.method} ${r.path}`), ['POST /customers', `POST /customers/${CUST}/accounts`]);
  assert.equal(w2.reqs[0].body!.first_name, 'Grace'); assert.equal(w2.reqs[0].body!.last_name, 'Hopper');
  assert.equal(c2.bounty.claim!.accountLast4, MADE.slice(-4));
  assert.equal(w2.stored()[0].claim!.createdAccount, true);
}

// ---- Submit ----
{
  const w = world();
  const p = v(w.svc.create(draft, 'x'));
  err(await w.svc.submit(p.bounty.id, { routeId: 'approved-route', claimSecret: 'x' }, 's'), 'FORBIDDEN'); // not claimed yet
  const c = v(await w.svc.claim(p.bounty.id, { creatorName: 'Casey', accountId: CREATOR }, 'x'));
  err(await w.svc.submit(p.bounty.id, { routeId: 'approved-route', claimSecret: 'bcs_wrong' }, 's'), 'FORBIDDEN');
  err(await w.svc.submit(p.bounty.id, { routeId: 'approved-route', claimSecret: p.posterSecret }, 's'), 'FORBIDDEN'); // the poster secret is not the claim secret
  err(await w.svc.submit(p.bounty.id, { routeId: 'draft-route', claimSecret: c.claimSecret }, 's'), 'NOT_APPROVED');
  err(await w.svc.submit(p.bounty.id, { routeId: 'nope', claimSecret: c.claimSecret }, 's'), 'NOT_FOUND');
  err(await w.svc.submit(p.bounty.id, { routeId: '', claimSecret: c.claimSecret }, 's'), 'INVALID_INPUT');
  const sub = v(await w.svc.submit(p.bounty.id, { routeId: 'approved-route', claimSecret: c.claimSecret }, 's'));
  assert.deepEqual([sub.status, sub.route?.id, sub.route?.version], ['submitted', 'approved-route', 2]);
  err(await w.svc.submit(p.bounty.id, { routeId: 'other-approved', claimSecret: c.claimSecret }, 's'), 'CONFLICT'); // already submitted
  // One route cannot back two bounties
  const p2 = v(w.svc.create(draft, 'y')); const c2 = v(await w.svc.claim(p2.bounty.id, { creatorName: 'Dee', accountId: CREATOR }, 'y'));
  err(await w.svc.submit(p2.bounty.id, { routeId: 'approved-route', claimSecret: c2.claimSecret }, 'y'), 'CONFLICT');
  // Sending a route back frees it
  v(w.svc.reject(p.bounty.id, { posterSecret: p.posterSecret }, 'x'));
  v(await w.svc.submit(p2.bounty.id, { routeId: 'approved-route', claimSecret: c2.claimSecret }, 'y'));
}

// ---- Cancel and reject need the poster secret ----
{
  const w = world();
  const p = v(w.svc.create(draft, 'x'));
  err(w.svc.cancel(p.bounty.id, { posterSecret: 'bps_wrong' }, 'x'), 'FORBIDDEN');
  err(w.svc.cancel(p.bounty.id, {}, 'x'), 'INVALID_INPUT');
  err(w.svc.cancel(p.bounty.id, { posterSecret: '' }, 'x'), 'FORBIDDEN');
  assert.equal(v(w.svc.get(p.bounty.id)).status, 'open');
  assert.equal(v(w.svc.cancel(p.bounty.id, { posterSecret: p.posterSecret }, 'x')).status, 'cancelled');
  assert.equal(v(w.svc.cancel(p.bounty.id, { posterSecret: p.posterSecret }, 'x')).status, 'cancelled'); // idempotent
  err(await w.svc.claim(p.bounty.id, { creatorName: 'a', accountId: CREATOR }, 'x'), 'CONFLICT');
  assert.equal(v(await w.svc.board()).bounties.length, 0); // cancelled bounties leave the board
  const s = await toSubmitted(w);
  err(w.svc.reject(s.id, { posterSecret: s.claimSecret }, 'x'), 'FORBIDDEN');
  assert.equal(v(w.svc.reject(s.id, { posterSecret: s.posterSecret }, 'x')).status, 'claimed');
  err(w.svc.reject(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  assert.equal(w.moneyCalls().length, 0);
}

// ---- Pay: secret, state, exact request, idempotency ----
{
  const w = world();
  const s = await toSubmitted(w);
  const pay = (extra: object = {}) => w.svc.pay(s.id, { posterSecret: s.posterSecret, ...extra }, 'payer');
  err(await w.svc.pay(s.id, { posterSecret: 'bps_wrong' }, 'x'), 'FORBIDDEN');
  err(await w.svc.pay(s.id, { posterSecret: s.claimSecret }, 'x'), 'FORBIDDEN');
  err(await w.svc.pay(s.id, {}, 'x'), 'INVALID_INPUT');
  assert.equal(w.moneyCalls().length, 0, 'a wrong secret never reaches Nessie');
  // Not submitted yet
  const early = v(w.svc.create(draft, 'e'));
  err(await w.svc.pay(early.bounty.id, { posterSecret: early.posterSecret }, 'x'), 'CONFLICT');
  // Double click: both requests at once
  const [a, b] = await Promise.all([pay(), pay()]);
  assert.equal([a, b].filter((r) => r.ok).length, 1, 'one request pays, the other is refused as in progress');
  err(a.ok ? b : a, 'CONFLICT');
  assert.equal(w.moneyCalls().length, 1, 'exactly one Nessie transfer');
  const t = w.moneyCalls()[0];
  assert.equal(t.path, `/accounts/${FUND}/transfers`);
  assert.deepEqual(t.body, { medium: 'balance', payee_id: CREATOR, amount: 10, transaction_date: '2023-11-14', description: t.body!.description });
  const paid = v(await pay());
  assert.deepEqual([paid.status, paid.payout?.state, paid.payout?.method], ['paid', 'done', 'transfer']);
  assert.match(paid.payout!.transferId!, /^[a-z0-9]{24}$/);
  assert.equal(w.moneyCalls().length, 1, 'a retry after paid sends nothing');
  assert.equal(v(await pay()).payout!.transferId, paid.payout!.transferId);
  assert.equal(w.stored()[0].payout!.transferId, paid.payout!.transferId); // saved
  err(w.svc.cancel(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  err(w.svc.reject(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  const board = v(await w.svc.board());
  assert.equal(board.paidOutUsd, 10);
  assert.deepEqual(board.funding, { balanceUsd: 1000, error: null });
  // Restart: the paid state survives and still cannot pay twice
  const again = w.build();
  assert.equal(v(await again.pay(s.id, { posterSecret: s.posterSecret }, 'x')).status, 'paid');
  assert.equal(w.moneyCalls().length, 1);
}

// ---- Pay: Nessie refuses (transfer-only mode) ----
{
  const w = world({ config: { payoutMode: 'transfer' } });
  const s = await toSubmitted(w);
  w.once(() => refuse('payee_id is not allowed'));
  const r = await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x');
  err(r, 'INVALID_INPUT'); assert.match((r as { error: { message: string } }).error.message, /payee_id is not allowed/);
  let cur = v(w.svc.get(s.id));
  assert.deepEqual([cur.status, cur.payout?.state, cur.payout?.transferId], ['submitted', 'failed', null]); // never marked paid
  assert.equal(w.moneyCalls().length, 1);
  const ok = v(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x')); // plain retry is allowed after a refusal
  assert.deepEqual([ok.status, ok.payout?.attempts], ['paid', 2]);
  assert.equal(w.moneyCalls().length, 2);
}

// ---- Pay: auto falls back to withdrawal + deposit, and never repeats the withdrawal ----
{
  const w = world();
  const s = await toSubmitted(w);
  w.once((r) => (r.path.endsWith('/transfers') ? refuse('payee_id is not allowed') : undefined), (r) => (r.path.endsWith('/withdrawals') ? undefined : undefined), (r) => (r.path.endsWith('/deposits') ? refuse('deposit refused') : undefined));
  const first = await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x');
  err(first, 'INVALID_INPUT');
  assert.deepEqual(w.moneyCalls().map((r) => r.path.split('/').at(-1)), ['transfers', 'withdrawals', 'deposits']);
  let cur = v(w.svc.get(s.id));
  assert.deepEqual([cur.status, cur.payout?.state, cur.payout?.method], ['submitted', 'failed', 'ledger']);
  assert.ok(cur.payout!.withdrawalId && !cur.payout!.depositId);
  assert.ok(w.stored()[0].payout!.withdrawalId, 'withdrawal id saved before the deposit');
  err(w.svc.cancel(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT'); // money already left the funding account
  err(w.svc.reject(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  const done = v(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x'));
  assert.deepEqual(w.moneyCalls().map((r) => r.path.split('/').at(-1)), ['transfers', 'withdrawals', 'deposits', 'deposits']); // deposit only
  assert.deepEqual([done.status, done.payout?.method], ['paid', 'ledger']);
  assert.ok(done.payout!.withdrawalId && done.payout!.depositId && !done.payout!.transferId);
}
// Ledger mode never tries a transfer.
{
  const w = world({ config: { payoutMode: 'ledger' } });
  const s = await toSubmitted(w);
  assert.equal(v(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x')).status, 'paid');
  assert.deepEqual(w.moneyCalls().map((r) => r.path.split('/').at(-1)), ['withdrawals', 'deposits']);
}

// ---- Pay: timeout or 5xx is uncertain, so no silent second payment ----
for (const outage of [() => new Response('boom', { status: 502 }), () => { throw new TypeError('network'); }]) {
  const w = world();
  const s = await toSubmitted(w);
  w.once(outage);
  err(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x'), 'PROVIDER_UNAVAILABLE');
  let cur = v(w.svc.get(s.id));
  assert.deepEqual([cur.status, cur.payout?.state], ['paying', 'uncertain']); // not paid, not retryable by a plain click
  assert.equal(w.moneyCalls().length, 1);
  err(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  err(w.svc.cancel(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  assert.equal(w.moneyCalls().length, 1, 'a plain retry sends nothing');
  const forced = v(await w.svc.pay(s.id, { posterSecret: s.posterSecret, retryUncertain: true }, 'x'));
  assert.equal(forced.status, 'paid'); assert.equal(w.moneyCalls().length, 2);
}
// A real timeout through the client.
{
  const w = world();
  const s = await toSubmitted(w);
  w.once((r) => (r.path.endsWith('/transfers') ? HANG : undefined));
  const keepAlive = setInterval(() => {}, 10);
  const r = await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x');
  clearInterval(keepAlive);
  err(r, 'PROVIDER_UNAVAILABLE');
  assert.equal(v(w.svc.get(s.id)).payout?.state, 'uncertain');
}
// A restart in the middle of a payout reads as uncertain, never as paid.
{
  const w = world();
  const s = await toSubmitted(w);
  w.once((r) => (r.path.endsWith('/transfers') ? HANG : undefined));
  const inflight = w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(w.stored()[0].status, 'paying'); assert.equal(w.stored()[0].payout!.state, 'inflight'); // intent is on disk before Nessie answers
  const restarted = w.build();
  assert.equal(v(restarted.get(s.id)).payout!.state, 'uncertain');
  err(await restarted.pay(s.id, { posterSecret: s.posterSecret }, 'x'), 'CONFLICT');
  const keepAlive = setInterval(() => {}, 10);
  await inflight; // the client timeout ends it as uncertain
  clearInterval(keepAlive);
  assert.equal(v(w.svc.get(s.id)).payout!.state, 'uncertain');
}
// If intent cannot be saved, no money call happens.
{
  let fail = false;
  const w = world({ persistThrows: () => fail });
  const s = await toSubmitted(w);
  fail = true;
  err(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x'), 'PROVIDER_UNAVAILABLE');
  assert.equal(w.moneyCalls().length, 0);
  assert.equal(v(w.svc.get(s.id)).status, 'submitted');
  fail = false;
  assert.equal(v(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x')).status, 'paid');
}
// Route must still be approved at payment time; reward is re-capped.
{
  const w = world();
  const s = await toSubmitted(w);
  w.setRoutes([]);
  err(await w.svc.pay(s.id, { posterSecret: s.posterSecret }, 'x'), 'NOT_APPROVED');
  assert.equal(w.moneyCalls().length, 0);
  const w2 = world();
  const s2 = await toSubmitted(w2);
  w2.cfg.maxRewardUsd = 5;
  err(await w2.svc.pay(s2.id, { posterSecret: s2.posterSecret }, 'x'), 'INVALID_INPUT');
  assert.equal(w2.moneyCalls().length, 0);
}
// Funding balance: cached briefly, and a Nessie failure reads as an error on the board, not a crash.
{
  const w = world();
  v(await w.svc.board()); v(await w.svc.board());
  assert.equal(w.reqs.filter((r) => r.method === 'GET').length, 1);
  const bad = world();
  bad.once(() => new Response('x', { status: 500 }));
  const board = v(await bad.svc.board());
  assert.equal(board.funding?.balanceUsd, null); assert.ok(board.funding?.error); assert.ok(!JSON.stringify(board).includes(KEY));
}
console.log('bounty checks passed');
