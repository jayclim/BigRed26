'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { bountiesApi, saveSecret, type Board, type PublicBounty } from '@/client/bounties.ts';
import { Badge } from '@/ui/badge';
import { Brand } from '@/ui/Brand.tsx';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Textarea } from '@/ui/textarea';
import styles from './bounties.module.css';
import { SecretNotice, StatusBadge, usd } from './shared.tsx';

function BountyCard({ b }: { b: PublicBounty }) {
  return (
    <li className={styles.card}>
      <div className={styles.cardTop}><h3>{b.title}</h3><span className={styles.reward}>{usd(b.rewardUsd)}</span></div>
      <p>{b.description}</p>
      <p className={styles.meta}>Posted by {b.poster}{b.claim ? ` · Claimed by ${b.claim.creatorName}` : ''}</p>
      <div className="row">
        <StatusBadge bounty={b} />
        {b.payout?.transferId && <Badge variant="outline">Transfer {b.payout.transferId.slice(0, 8)}</Badge>}
        <Button variant={b.status === 'open' ? 'default' : 'outline'} size="sm" asChild><Link href={`/bounties/${encodeURIComponent(b.id)}`}>{b.status === 'open' ? 'View and claim' : 'Open'}</Link></Button>
      </div>
    </li>
  );
}

function PostForm({ board, onPosted }: { board: Board; onPosted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ id: string; secret: string } | null>(null);
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const form = ev.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(null);
    const r = await bountiesApi.create({
      title: String(data.get('title') ?? ''), description: String(data.get('description') ?? ''),
      poster: String(data.get('poster') ?? ''), rewardUsd: Number(data.get('reward')),
    });
    setBusy(false);
    if (!r.ok) { setError(r.error.message); return; }
    saveSecret(r.value.bounty.id, 'posterSecret', r.value.posterSecret);
    setMade({ id: r.value.bounty.id, secret: r.value.posterSecret });
    form.reset(); onPosted();
  }
  if (made) return (
    <div className={styles.stack}>
      <SecretNotice title="Keep your poster secret" secret={made.secret}
        body="You need it to approve and pay, or to cancel. It is shown once. This browser also remembers it." onDone={() => setMade(null)} />
      <Button variant="outline" asChild><Link href={`/bounties/${encodeURIComponent(made.id)}`}>Open your bounty</Link></Button>
    </div>
  );
  return (
    <form className={styles.form} onSubmit={submit} aria-label="Post a bounty">
      <h2>Post a bounty</h2>
      <label className={styles.field}>Route you want
        <Input name="title" required maxLength={120} placeholder="Clark Hall lobby to AEP study room 269" /></label>
      <label className={styles.field}>Start and destination details
        <Textarea name="description" required maxLength={600} rows={3} placeholder="Where to start, where to end, anything a visitor should pass." /></label>
      <label className={styles.field}>Your name
        <Input name="poster" required maxLength={80} autoComplete="name" /></label>
      <label className={styles.field}>Reward in sandbox dollars
        <Input name="reward" type="number" required min={1} max={board.payments.maxRewardUsd} step={1} inputMode="numeric" />
        <span className={styles.hint}>Whole dollars, $1 to ${board.payments.maxRewardUsd}.</span></label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post bounty'}</Button>
    </form>
  );
}

export function BoardScreen() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const r = await bountiesApi.board();
    if (r.ok) setBoard(r.value); else setError(r.error.message);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = board?.bounties.filter((b) => b.status === 'open') ?? [];
  const active = board?.bounties.filter((b) => b.status === 'claimed' || b.status === 'submitted' || b.status === 'paying') ?? [];
  const paid = board?.bounties.filter((b) => b.status === 'paid') ?? [];

  return (
    <main className="creator">
      <header>
        <div className="creator-top">
          <Brand />
          <div className="creator-context">
            <Link href="/routes" className="creator-nav">All routes</Link>
            <Link href="/" className="creator-nav">Teach a route</Link>
          </div>
        </div>
        <div className="route-title"><h1>Route bounties</h1></div>
        <p className="notice">Ask for a route. Someone teaches it, you approve it, and they get paid. Rewards use Capital One Nessie sandbox money, not real dollars.</p>
        {board && (
          <dl className={styles.stats} aria-label="Bounty funding">
            <div><dt>Open bounties</dt><dd>{open.length}</dd></div>
            <div><dt>Paid out here</dt><dd>{usd(board.paidOutUsd)}</dd></div>
            {board.funding && <div><dt>Funding account balance</dt>
              <dd>{board.funding.balanceUsd !== null ? usd(board.funding.balanceUsd) : 'Unavailable'}</dd></div>}
          </dl>
        )}
        {board?.funding?.error && <p className="notice error" role="alert">Funding balance: {board.funding.error}</p>}
      </header>
      {error && <div className="notice error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {!error && !board && <p role="status">Loading bounties…</p>}
      {board && (
        <div className={styles.layout}>
          <div className={styles.stack}>
            {!board.payments.enabled && <p className="notice">Payouts are not set up on this server, so the board is read-only.</p>}
            {[['Open', open, 'No open bounties yet.'], ['In progress', active, 'Nothing in progress.'], ['Paid', paid, 'Nothing paid yet.']].map(([label, items, empty]) => (
              <section key={label as string} className={styles.section} aria-label={label as string}>
                <h2>{label as string}</h2>
                {(items as PublicBounty[]).length === 0 ? <p className={styles.meta}>{empty as string}</p>
                  : <ul className={styles.list}>{(items as PublicBounty[]).map((b) => <BountyCard key={b.id} b={b} />)}</ul>}
              </section>
            ))}
          </div>
          {board.payments.enabled && <PostForm board={board} onPosted={() => void load()} />}
        </div>
      )}
    </main>
  );
}
