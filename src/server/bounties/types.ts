// Bounty records and their persisted shape. Money is whole US dollars (Nessie sandbox money, not real).
import { z } from 'zod';

export const STATUSES = ['open', 'claimed', 'submitted', 'paying', 'paid', 'cancelled'] as const;
export type BountyStatus = (typeof STATUSES)[number];

const text = (max: number) => z.string().min(1).max(max);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const ClaimSchema = z.object({
  creatorName: text(80),
  accountId: text(64),
  createdAccount: z.boolean(), // true when the server opened a payout account for the creator
  claimedAt: z.string(),
  secretHash: hash,
});

// state: inflight = a Nessie call is running; uncertain = it may or may not have been applied (needs a deliberate retry);
// failed = Nessie refused, nothing moved except what withdrawalId records; done = paid.
export const PayoutSchema = z.object({
  state: z.enum(['inflight', 'uncertain', 'failed', 'done']),
  method: z.enum(['transfer', 'ledger']).nullable(),
  transferId: z.string().nullable(),
  withdrawalId: z.string().nullable(),
  depositId: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  startedAt: z.string(),
  paidAt: z.string().nullable(),
});

export const BountySchema = z.object({
  id: text(64),
  title: text(120),
  description: text(600),
  poster: text(80),
  rewardUsd: z.number().int().positive(),
  status: z.enum(STATUSES),
  createdAt: z.string(),
  posterSecretHash: hash,
  claim: ClaimSchema.nullable(),
  routeId: z.string().nullable(),
  routeName: z.string().nullable(),
  routeVersion: z.number().int().nullable(),
  submittedAt: z.string().nullable(),
  payout: PayoutSchema.nullable(),
});

export const FileSchema = z.object({ version: z.literal(1), bounties: z.array(BountySchema) });

export type Bounty = z.infer<typeof BountySchema>;
export type Payout = z.infer<typeof PayoutSchema>;

/** What the board and API show. Never contains a secret hash; the creator's account id is masked. */
export interface PublicBounty {
  id: string; title: string; description: string; poster: string; rewardUsd: number; status: BountyStatus; createdAt: string;
  claim: { creatorName: string; accountLast4: string; claimedAt: string } | null;
  route: { id: string; name: string; version: number; submittedAt: string } | null;
  payout: { state: Payout['state']; method: Payout['method']; transferId: string | null; withdrawalId: string | null; depositId: string | null;
    attempts: number; error: string | null; paidAt: string | null } | null;
}

// Allowed status moves. paying -> submitted is a refused payout; paying -> paid is a confirmed one.
export const TRANSITIONS: Record<BountyStatus, readonly BountyStatus[]> = {
  open: ['claimed', 'cancelled'],
  claimed: ['submitted', 'cancelled'],
  submitted: ['claimed', 'paying', 'cancelled'], // submitted -> claimed is the poster sending the route back
  paying: ['paid', 'submitted'],
  paid: [],
  cancelled: [],
};
export const canMove = (from: BountyStatus, to: BountyStatus) => TRANSITIONS[from].includes(to);

export const toPublic = (b: Bounty): PublicBounty => ({
  id: b.id, title: b.title, description: b.description, poster: b.poster, rewardUsd: b.rewardUsd, status: b.status, createdAt: b.createdAt,
  claim: b.claim ? { creatorName: b.claim.creatorName, accountLast4: b.claim.accountId.slice(-4), claimedAt: b.claim.claimedAt } : null,
  route: b.routeId && b.routeName && b.routeVersion !== null && b.submittedAt ? { id: b.routeId, name: b.routeName, version: b.routeVersion, submittedAt: b.submittedAt } : null,
  payout: b.payout ? { state: b.payout.state, method: b.payout.method, transferId: b.payout.transferId, withdrawalId: b.payout.withdrawalId,
    depositId: b.payout.depositId, attempts: b.payout.attempts, error: b.payout.error, paidAt: b.payout.paidAt } : null,
});
