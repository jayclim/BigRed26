'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Route } from '@contracts/contracts.ts';
import { bountiesApi, savedSecrets, type PublicBounty } from '@/client/bounties.ts';
import { StatusBadge, usd } from '@/app/bounties/shared.tsx';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import styles from './bountyPanel.module.css';

/** The bounty a route answers, shown on the teach page. Once the route is approved, the person who claimed the bounty
 *  submits it here with the claim secret this browser saved at claim time. The server still checks the secret, the approval and the claim. */
export function BountyPanel({ bountyId, bounty: initial, loadError, route }: {
  bountyId: string; bounty: PublicBounty | null; loadError: string | null; route: Route | null;
}) {
  const [bounty, setBounty] = useState<PublicBounty | null>(initial);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { setBounty(initial); }, [initial]);
  const [remembered, setRemembered] = useState(true);
  useEffect(() => { const s = savedSecrets(bountyId).claimSecret ?? ''; setSecret(s); setRemembered(s !== ''); }, [bountyId]);

  const link = `/bounties/${encodeURIComponent(bountyId)}`;
  if (loadError && !bounty) return <section className={styles.panel} aria-label="Bounty"><p className="notice error" role="alert">{loadError}</p></section>;
  if (!bounty) return <section className={styles.panel} aria-label="Bounty"><p role="status">Loading bounty…</p></section>;

  const approved = route?.status === 'approved';
  const submittedHere = !!route && bounty.route?.id === route.id;
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy || !route) return;
    setBusy(true); setError(null);
    const r = await bountiesApi.submit(bountyId, route.id, secret.trim());
    setBusy(false);
    if (r.ok) { setBounty(r.value); setDone(true); } else setError(r.error.message);
  }

  return (
    <section className={styles.panel} aria-label="Bounty request">
      <div className={styles.head}>
        <div>
          <p className={styles.kicker}>Bounty request</p>
          <h2>{bounty.title}</h2>
        </div>
        <div className={styles.reward}><strong>{usd(bounty.rewardUsd)}</strong><StatusBadge bounty={bounty} /></div>
      </div>
      <p className={styles.text}>{bounty.description}</p>

      {bounty.status === 'open' && (
        <p className={styles.text}>You have not taken this request yet. <Link href={link}>Take it first</Link>, then come back to teach the route.</p>
      )}
      {bounty.status === 'claimed' && !approved && (
        <p className={styles.text}>{route ? 'Approve this route, then submit it to the bounty here.' : 'Record the route in a video. Once you approve the draft, you can submit it to the bounty here.'}</p>
      )}
      {bounty.status === 'claimed' && approved && !done && (
        <form className={styles.submit} onSubmit={submit} aria-label="Submit to bounty">
          {!remembered && (
            <label className={styles.field}>Claim secret
              <Input value={secret} onChange={(e) => setSecret(e.target.value)} required maxLength={200} autoComplete="off" spellCheck={false} />
              <span className={styles.hint}>This browser has no saved claim secret for this bounty. Paste the one you saved.</span></label>
          )}
          {error && <div className="notice error" role="alert">{error}</div>}
          <div className="row">
            <Button type="submit" disabled={busy || !secret.trim()}>{busy ? 'Submitting…' : 'Submit to bounty'}</Button>
            <span className={styles.hint}>Sends approved version {route!.version} of this route to the poster.</span>
          </div>
        </form>
      )}
      {(done || (submittedHere && bounty.status === 'submitted')) && (
        <div className="notice ok" role="status">
          <p>Route submitted. The poster can now approve it and pay {usd(bounty.rewardUsd)}.</p>
          <div className="row"><Button asChild><Link href={link}>Back to the bounty</Link></Button></div>
        </div>
      )}
      {bounty.status === 'paid' && submittedHere && <p className="notice ok">Paid. <Link href={link}>See the payout</Link>.</p>}
      {bounty.status !== 'open' && bounty.status !== 'claimed' && !submittedHere && <p className={styles.text}><Link href={link}>Open the bounty</Link> to see where it stands.</p>}
    </section>
  );
}
