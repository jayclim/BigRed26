// Bounty payment gate and limits, read from the environment at process start.
import { DEFAULT_NESSIE_URL, isNessieId } from '../nessie/client.ts';

export const DEFAULT_MAX_REWARD_USD = 50;
export type PayoutMode = 'auto' | 'transfer' | 'ledger';
export interface BountyConfig {
  enabled: boolean; // BREADCRUMB_BOUNTIES=1 plus a Nessie key and a funding account. Off = the board is read-only.
  apiKey: string; fundingAccountId: string; baseUrl: string;
  maxRewardUsd: number;
  payoutMode: PayoutMode; // auto: try a transfer, and when Nessie refuses it, a withdrawal plus a deposit
}

const wholeNumber = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isInteger(n) && n > 0 ? n : fallback;
};
const httpUrl = (v: string | undefined) => {
  if (!v) return DEFAULT_NESSIE_URL;
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? v.replace(/\/+$/, '') : DEFAULT_NESSIE_URL; } catch { return DEFAULT_NESSIE_URL; }
};

export function bountyConfig(env: Record<string, string | undefined> = process.env): BountyConfig {
  const apiKey = env.NESSIE_API_KEY?.trim() ?? '';
  const fundingAccountId = env.NESSIE_FUNDING_ACCOUNT_ID?.trim() ?? '';
  const mode = env.NESSIE_PAYOUT_MODE;
  return {
    enabled: env.BREADCRUMB_BOUNTIES === '1' && apiKey !== '' && isNessieId(fundingAccountId),
    apiKey, fundingAccountId, baseUrl: httpUrl(env.NESSIE_BASE_URL),
    maxRewardUsd: wholeNumber(env.BREADCRUMB_BOUNTY_MAX, DEFAULT_MAX_REWARD_USD),
    payoutMode: mode === 'transfer' || mode === 'ledger' ? mode : 'auto',
  };
}
