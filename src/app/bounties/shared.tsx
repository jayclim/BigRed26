'use client';
import { useState } from 'react';
import type { BountyStatus, PublicBounty } from '@/server/bounties/types.ts';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import styles from './bounties.module.css';

export const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const LABEL: Record<BountyStatus, string> = { open: 'Open', claimed: 'Claimed', submitted: 'Route submitted', paying: 'Paying', paid: 'Paid', cancelled: 'Cancelled' };
export function StatusBadge({ bounty }: { bounty: PublicBounty }) {
  const s = bounty.status;
  const label = s === 'paying' && bounty.payout?.state === 'uncertain' ? 'Payout unconfirmed' : LABEL[s];
  return <Badge variant={s === 'paid' ? 'success' : s === 'open' ? 'default' : 'secondary'}>{label}</Badge>;
}

async function copy(text: string) {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall through */ }
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(area); area.select();
  let done = false;
  try { done = document.execCommand('copy'); } catch { /* stays false */ }
  area.remove();
  return done;
}

/** A secret shown once. It is also kept in this browser so the poster or creator does not retype it. */
export function SecretNotice({ title, secret, body, onDone }: { title: string; secret: string; body: string; onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className={styles.secret} role="status">
      <strong>{title}</strong>
      <p className={styles.meta}>{body}</p>
      <code>{secret}</code>
      <div className="row">
        <Button variant="outline" size="sm" onClick={async () => setState((await copy(secret)) ? 'copied' : 'failed')}>
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed. Select the text' : 'Copy secret'}
        </Button>
        <Button size="sm" onClick={onDone}>I saved it</Button>
      </div>
    </div>
  );
}

export function PayoutSummary({ bounty }: { bounty: PublicBounty }) {
  const p = bounty.payout;
  if (!p) return null;
  const ids: Array<[string, string | null]> = [['Nessie transfer id', p.transferId], ['Nessie withdrawal id', p.withdrawalId], ['Nessie deposit id', p.depositId]];
  const text = p.state === 'done' ? `Paid ${usd(bounty.rewardUsd)} on ${p.paidAt ? new Date(p.paidAt).toLocaleString() : ''}`
    : p.state === 'inflight' ? 'Payout in progress'
    : p.state === 'uncertain' ? 'Payout unconfirmed: Nessie may have applied it'
    : 'Last payout attempt was refused';
  return (
    <div className={styles.stack}>
      <p><strong>{text}</strong></p>
      {p.error && p.state !== 'done' && <p className={styles.meta}>{p.error}</p>}
      <dl className={styles.ids}>
        {ids.filter(([, v]) => v).map(([label, v]) => <div key={label}><dt>{label}</dt><dd><code className={styles.code}>{v}</code></dd></div>)}
      </dl>
    </div>
  );
}
