// Bounty board logic: post, claim, submit an approved route, then the poster approves and Nessie pays.
// Single process, synchronous state changes before every await, so a double click cannot interleave.
// A payout writes `paying` + `inflight` to disk BEFORE calling Nessie, and ids as soon as Nessie returns them, so a retry,
// a crash or a double click never sends money twice without an explicit, labeled retry.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CoreAdapter } from '../../../contracts/contracts.ts';
import { isNessieId, type NessieClient, type NessieFailure } from '../nessie/client.ts';
import type { BountyConfig } from './config.ts';
import { allow, createLimiter, type LimitKind, type Limiter } from './limits.ts';
import { canMove, toPublic, type Bounty, type BountyStatus, type Payout, type PublicBounty } from './types.ts';

export type BountyCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'NOT_APPROVED' | 'FORBIDDEN' | 'CONFLICT' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE';
export type Out<T> = { ok: true; value: T } | { ok: false; error: { code: BountyCode; message: string; retryable: boolean } };
const fail = (code: BountyCode, message: string, retryable = false): Out<never> => ({ ok: false, error: { code, message, retryable } });
const ok = <T,>(value: T): Out<T> => ({ ok: true, value });

export const MAX_BOUNTIES = 500; // stored, any status
export const MAX_ACTIVE = 100; // open, claimed, submitted or paying
const FUNDING_CACHE_MS = 20_000;

const plain = (max: number, what: string) => z.string().trim().min(1, `${what} is required.`).max(max, `${what} must be at most ${max} characters.`)
  .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s), `${what} must be plain text.`);
export const CreateSchema = z.object({
  title: plain(120, 'Title'), description: plain(600, 'Description'), poster: plain(80, 'Your name'),
  rewardUsd: z.number('Reward must be a number.').int('Reward must be a whole number of dollars.').positive('Reward must be at least $1.'),
}).strict();
export const ClaimSchemaIn = z.object({
  creatorName: plain(80, 'Your name'),
  accountId: z.string().trim().max(64).optional(),
  createAccount: z.boolean().optional(),
}).strict();
export const SubmitSchema = z.object({ routeId: plain(200, 'Route'), claimSecret: z.string().max(200) }).strict();
export const PosterSchema = z.object({ posterSecret: z.string().max(200), retryUncertain: z.boolean().optional() }).strict();

const digest = (s: string) => createHash('sha256').update(s).digest();
export const hashSecret = (s: string) => digest(s).toString('hex');
/** Constant-time compare of a given secret with a stored hash. */
export const secretMatches = (given: string | undefined, storedHash: string) =>
  typeof given === 'string' && given.length > 0 && timingSafeEqual(digest(given), Buffer.from(storedHash, 'hex'));
const newSecret = (prefix: string) => `${prefix}_${randomBytes(18).toString('base64url')}`;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ServiceDeps {
  bounties: Bounty[];
  persist: (bounties: Bounty[]) => void;
  config: BountyConfig;
  nessie: NessieClient | null;
  core: Pick<CoreAdapter, 'listRoutes'>;
  now?: () => number;
  limiter?: Limiter;
  newId?: () => string;
}

export interface Board {
  bounties: PublicBounty[];
  payments: { enabled: boolean; maxRewardUsd: number };
  paidOutUsd: number;
  funding: { balanceUsd: number | null; error: string | null } | null;
}

export function createBountyService(deps: ServiceDeps) {
  const { config, nessie, core } = deps;
  const now = deps.now ?? Date.now;
  const limiter = deps.limiter ?? createLimiter();
  const newId = deps.newId ?? randomUUID;
  // Own-property safe by construction: a Map keyed by validated ids, never an object indexed by user input.
  const byId = new Map<string, Bounty>(deps.bounties.map((b) => [b.id, b]));
  // A restart in the middle of a payout cannot know whether Nessie applied it.
  for (const b of byId.values()) if (b.payout?.state === 'inflight') b.payout.state = 'uncertain';
  const claiming = new Set<string>();
  let funding: { at: number; value: NonNullable<Board['funding']> } | null = null;

  const iso = () => new Date(now()).toISOString();
  const list = () => [...byId.values()];
  const save = (): string | null => {
    try { deps.persist(list()); return null; } catch (e) { console.error('[bounties] could not save', (e as NodeJS.ErrnoException).code ?? 'error'); return "Couldn't save the bounty file."; }
  };
  const find = (id: string) => (typeof id === 'string' && ID.test(id) ? byId.get(id) : undefined);
  const move = (b: Bounty, to: BountyStatus) => { if (!canMove(b.status, to)) throw new Error(`bad bounty move ${b.status} -> ${to}`); b.status = to; };
  const rate = (kind: LimitKind, client: string) => (allow(limiter, kind, client, now()) ? null : fail('RATE_LIMITED', 'Too many requests from this device. Wait a minute and retry.', true));
  const needPayments = () => (config.enabled && nessie ? null : fail('PROVIDER_UNAVAILABLE', 'Payouts are not set up on this server, so the board is read-only.'));
  const nessieDown = (f: NessieFailure) => fail(f.kind === 'rejected' ? 'INVALID_INPUT' : 'PROVIDER_UNAVAILABLE', f.message, f.kind === 'ambiguous');

  async function board(): Promise<Out<Board>> {
    const all = list().filter((b) => b.status !== 'cancelled').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
    const paidOutUsd = list().filter((b) => b.status === 'paid').reduce((sum, b) => sum + b.rewardUsd, 0);
    let fundingView: Board['funding'] = null;
    if (config.enabled && nessie) {
      if (funding && now() - funding.at < FUNDING_CACHE_MS) fundingView = funding.value;
      else {
        const r = await nessie.getAccount(config.fundingAccountId);
        fundingView = r.ok ? { balanceUsd: r.value.balance, error: null } : { balanceUsd: null, error: r.message };
        funding = { at: now(), value: fundingView };
      }
    }
    return ok({ bounties: all.map(toPublic), payments: { enabled: config.enabled, maxRewardUsd: config.maxRewardUsd }, paidOutUsd, funding: fundingView });
  }

  function get(id: string): Out<PublicBounty> {
    const b = find(id);
    return b ? ok(toPublic(b)) : fail('NOT_FOUND', 'Bounty not found.');
  }

  function create(input: unknown, client: string): Out<{ bounty: PublicBounty; posterSecret: string }> {
    const off = needPayments(); if (off) return off;
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid bounty.');
    const v = parsed.data;
    if (v.rewardUsd > config.maxRewardUsd) return fail('INVALID_INPUT', `Reward can be at most $${config.maxRewardUsd}.`);
    const limited = rate('post', client); if (limited) return limited;
    if (byId.size >= MAX_BOUNTIES || list().filter((b) => b.status !== 'paid' && b.status !== 'cancelled').length >= MAX_ACTIVE)
      return fail('CONFLICT', 'The board is full. Try again after some bounties finish.');
    const posterSecret = newSecret('bps');
    const b: Bounty = {
      id: newId(), title: v.title, description: v.description, poster: v.poster, rewardUsd: v.rewardUsd, status: 'open', createdAt: iso(),
      posterSecretHash: hashSecret(posterSecret), claim: null, routeId: null, routeName: null, routeVersion: null, submittedAt: null, payout: null,
    };
    byId.set(b.id, b);
    const err = save();
    if (err) { byId.delete(b.id); return fail('PROVIDER_UNAVAILABLE', err, true); }
    return ok({ bounty: toPublic(b), posterSecret });
  }

  async function claim(id: string, input: unknown, client: string): Promise<Out<{ bounty: PublicBounty; claimSecret: string }>> {
    const off = needPayments(); if (off || !nessie) return off!;
    const b = find(id); if (!b) return fail('NOT_FOUND', 'Bounty not found.');
    const parsed = ClaimSchemaIn.safeParse(input);
    if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid claim.');
    const { creatorName, accountId, createAccount } = parsed.data;
    if (!!accountId === !!createAccount) return fail('INVALID_INPUT', 'Give a Nessie account id, or ask for a payout account, not both.');
    if (accountId && !isNessieId(accountId)) return fail('INVALID_INPUT', 'That is not a valid Nessie account id.');
    if (accountId === config.fundingAccountId) return fail('INVALID_INPUT', 'Use your own payout account, not the funding account.');
    const limited = rate('claim', client); if (limited) return limited;
    if (b.status !== 'open' || claiming.has(b.id)) return fail('CONFLICT', 'This bounty is no longer open.');
    claiming.add(b.id); // held across the Nessie calls so two claimants cannot both win
    try {
      let account = accountId ?? '';
      if (accountId) {
        const r = await nessie.getAccount(accountId);
        if (!r.ok) return r.kind === 'rejected' ? fail('INVALID_INPUT', "Nessie can't find that account id.") : nessieDown(r);
      } else {
        const [first = 'Creator', ...rest] = creatorName.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().split(/\s+/);
        const customer = await nessie.createCustomer(first.slice(0, 40) || 'Creator', rest.join(' ').slice(0, 40) || 'Creator');
        if (!customer.ok) return nessieDown(customer);
        const made = await nessie.createAccount(customer.value, 'Breadcrumb creator payouts', 0);
        if (!made.ok) return nessieDown(made);
        account = made.value;
      }
      const claimSecret = newSecret('bcs');
      move(b, 'claimed');
      b.claim = { creatorName, accountId: account, createdAccount: !accountId, claimedAt: iso(), secretHash: hashSecret(claimSecret) };
      const err = save();
      if (err) { b.status = 'open'; b.claim = null; return fail('PROVIDER_UNAVAILABLE', err, true); }
      return ok({ bounty: toPublic(b), claimSecret });
    } finally { claiming.delete(b.id); }
  }

  async function submit(id: string, input: unknown, client: string): Promise<Out<PublicBounty>> {
    const b = find(id); if (!b) return fail('NOT_FOUND', 'Bounty not found.');
    const parsed = SubmitSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid submission.');
    const limited = rate('act', client); if (limited) return limited;
    if (!b.claim || !secretMatches(parsed.data.claimSecret, b.claim.secretHash)) return fail('FORBIDDEN', 'Wrong claim secret.');
    if (b.status !== 'claimed') return fail('CONFLICT', 'This bounty is not waiting for a route.');
    const routes = await core.listRoutes();
    if (!routes.ok) return fail('PROVIDER_UNAVAILABLE', "Couldn't read the route list.", true);
    const route = routes.value.find((r) => r.id === parsed.data.routeId);
    if (!route) return fail('NOT_FOUND', 'Route not found.');
    // Approval is the creator's explicit click on a saved version; a draft never counts.
    if (route.approvedVersion === null) return fail('NOT_APPROVED', 'Only approved routes can be submitted. Approve the route first.');
    if (b.status !== 'claimed') return fail('CONFLICT', 'This bounty is not waiting for a route.'); // re-check after the await
    if (list().some((o) => o.id !== b.id && o.routeId === route.id && o.status !== 'cancelled')) return fail('CONFLICT', 'That route is already linked to another bounty.');
    move(b, 'submitted');
    b.routeId = route.id; b.routeName = route.name; b.routeVersion = route.approvedVersion; b.submittedAt = iso();
    const err = save();
    if (err) { b.status = 'claimed'; b.routeId = b.routeName = b.routeVersion = b.submittedAt = null; return fail('PROVIDER_UNAVAILABLE', err, true); }
    return ok(toPublic(b));
  }

  /** Shared checks for the poster's actions. */
  function asPoster(id: string, input: unknown, client: string): Out<{ b: Bounty; retryUncertain: boolean }> {
    const b = find(id); if (!b) return fail('NOT_FOUND', 'Bounty not found.');
    const parsed = PosterSchema.safeParse(input);
    if (!parsed.success) return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid request.');
    const limited = rate('act', client); if (limited) return limited;
    if (!secretMatches(parsed.data.posterSecret, b.posterSecretHash)) return fail('FORBIDDEN', 'Wrong poster secret.');
    return ok({ b, retryUncertain: parsed.data.retryUncertain === true });
  }

  function cancel(id: string, input: unknown, client: string): Out<PublicBounty> {
    const a = asPoster(id, input, client); if (!a.ok) return a;
    const { b } = a.value;
    if (b.status === 'cancelled') return ok(toPublic(b)); // already done
    if (!canMove(b.status, 'cancelled')) return fail('CONFLICT', b.status === 'paid' ? 'This bounty is already paid.' : 'A payout is in progress and cannot be cancelled.');
    if (b.payout?.withdrawalId) return fail('CONFLICT', 'A payout already took money from the funding account. Retry the payout instead.');
    const was = b.status;
    move(b, 'cancelled');
    const err = save();
    if (err) { b.status = was; return fail('PROVIDER_UNAVAILABLE', err, true); }
    return ok(toPublic(b));
  }

  function reject(id: string, input: unknown, client: string): Out<PublicBounty> {
    const a = asPoster(id, input, client); if (!a.ok) return a;
    const { b } = a.value;
    if (b.status !== 'submitted') return fail('CONFLICT', 'There is no submitted route to send back.');
    if (b.payout?.withdrawalId) return fail('CONFLICT', 'A payout already took money from the funding account. Retry the payout instead.');
    const prev = { routeId: b.routeId, routeName: b.routeName, routeVersion: b.routeVersion, submittedAt: b.submittedAt, payout: b.payout };
    move(b, 'claimed');
    b.routeId = b.routeName = b.routeVersion = b.submittedAt = null; b.payout = null;
    const err = save();
    if (err) { b.status = 'submitted'; Object.assign(b, prev); return fail('PROVIDER_UNAVAILABLE', err, true); }
    return ok(toPublic(b));
  }

  /** Approve & pay. Idempotent: paid returns the stored result; in-flight and uncertain payouts never send a second call unasked. */
  async function pay(id: string, input: unknown, client: string): Promise<Out<PublicBounty>> {
    const a = asPoster(id, input, client); if (!a.ok) return a;
    const { b, retryUncertain } = a.value;
    if (b.status === 'paid') return ok(toPublic(b));
    const off = needPayments(); if (off || !nessie) return off!;
    if (b.status === 'paying') {
      if (b.payout?.state === 'inflight') return fail('CONFLICT', 'The payout is already in progress. Wait a moment, then refresh.', true);
      if (!retryUncertain) return fail('CONFLICT', "The last payout attempt didn't finish and Nessie may have applied it. Check the funding account, then retry on purpose.");
    } else if (b.status !== 'submitted' || !b.claim) {
      return fail('CONFLICT', 'There is no submitted route to pay for.');
    }
    if (!b.claim) return fail('CONFLICT', 'There is no claim to pay.');
    if (b.rewardUsd > config.maxRewardUsd) return fail('INVALID_INPUT', `This reward is above the current $${config.maxRewardUsd} limit.`);
    if (b.claim.accountId === config.fundingAccountId) return fail('INVALID_INPUT', 'The payout account is the funding account.');
    if (b.status === 'submitted') {
      const routes = await core.listRoutes(); // the route must still be approved at payment time
      if (!routes.ok) return fail('PROVIDER_UNAVAILABLE', "Couldn't read the route list.", true);
      if (!routes.value.some((r) => r.id === b.routeId && r.approvedVersion !== null)) return fail('NOT_APPROVED', "The linked route isn't approved anymore.");
      if (b.status !== 'submitted') return fail('CONFLICT', 'This bounty changed. Refresh and retry.'); // re-check after the await
    }
    // Persist intent before any money call. If this cannot be saved, nothing is sent.
    const was = { status: b.status, payout: b.payout };
    const prior: Payout | null = b.payout;
    if (b.status === 'submitted') move(b, 'paying');
    b.payout = {
      state: 'inflight', method: prior?.method ?? null, transferId: prior?.transferId ?? null, withdrawalId: prior?.withdrawalId ?? null,
      depositId: prior?.depositId ?? null, attempts: (prior?.attempts ?? 0) + 1, error: null, startedAt: iso(), paidAt: null,
    };
    const first = save();
    if (first) { b.status = was.status; b.payout = was.payout; return fail('PROVIDER_UNAVAILABLE', first, true); }

    const p = b.payout;
    const from = config.fundingAccountId, to = b.claim.accountId, amount = b.rewardUsd;
    const note = `Breadcrumb bounty ${b.id.slice(0, 8)}: ${b.title}`.slice(0, 100);
    const step = (id: string | null, key: 'transferId' | 'withdrawalId' | 'depositId') => { p[key] = id; save(); }; // ids hit disk as soon as Nessie returns them
    const stop = (state: 'uncertain' | 'failed', f: NessieFailure): Out<PublicBounty> => {
      p.state = state; p.error = f.message;
      if (state === 'failed') b.status = 'submitted'; // refused: nothing was sent by this step, so a plain retry is safe
      const err = save();
      return fail(state === 'uncertain' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_INPUT', `${f.message}${err ? ` ${err}` : ''}`, state === 'uncertain' || f.kind === 'ambiguous');
    };

    // 1. Transfer, unless a transfer id or a withdrawal already exists from an earlier attempt.
    let useLedger = config.payoutMode === 'ledger' || !!p.withdrawalId;
    if (!p.transferId && !useLedger) {
      p.method = 'transfer';
      const t = await nessie.transfer(from, to, amount, note);
      if (t.ok) step(t.value, 'transferId');
      else if (t.kind === 'ambiguous') return stop('uncertain', t);
      else if (config.payoutMode === 'auto') useLedger = true; // Nessie refused the transfer shape: nothing moved, try the pair
      else return stop('failed', t);
    }
    // 2. Fallback pair. The withdrawal id is saved before the deposit starts, so a retry only deposits.
    if (!p.transferId) {
      p.method = 'ledger';
      if (!p.withdrawalId) {
        const w = await nessie.withdraw(from, amount, note);
        if (!w.ok) return stop(w.kind === 'ambiguous' ? 'uncertain' : 'failed', w);
        step(w.value, 'withdrawalId');
      }
      if (!p.depositId) {
        const d = await nessie.deposit(to, amount, note);
        if (!d.ok) return stop(d.kind === 'ambiguous' ? 'uncertain' : 'failed', d);
        step(d.value, 'depositId');
      }
    }
    p.state = 'done'; p.error = null; p.paidAt = iso();
    move(b, 'paid');
    funding = null; // balance changed
    const err = save();
    if (err) return fail('PROVIDER_UNAVAILABLE', `Paid (Nessie id ${p.transferId ?? p.depositId}), but ${err.toLowerCase()} Do not pay again.`);
    return ok(toPublic(b));
  }

  return { board, get, create, claim, submit, cancel, reject, pay };
}
export type BountyService = ReturnType<typeof createBountyService>;
