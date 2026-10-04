'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RouteSummary } from '@contracts/contracts.ts';
import { bountiesApi, savedSecrets, saveSecret, type PublicBounty } from '@/client/bounties.ts';
import { httpCore } from '@/client/httpCore.ts';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { PageShell } from '@/ui/PageShell.tsx';
import { SiteHeader } from '@/ui/SiteHeader.tsx';
import styles from './bounties.module.css';
import { PayoutSummary, SecretNotice, StatusBadge, usd } from './shared.tsx';

function ClaimForm({ bounty, onChange }: { bounty: PublicBounty; onChange: (b: PublicBounty) => void }) {
  const [mode, setMode] = useState<'create' | 'existing'>('create');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ value: string; bounty: PublicBounty } | null>(null);
  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (busy) return;
    const data = new FormData(ev.currentTarget);
    setBusy(true); setError(null);
    const creatorName = String(data.get('creatorName') ?? '');
    const r = await bountiesApi.claim(bounty.id, mode === 'create' ? { creatorName, createAccount: true } : { creatorName, accountId: String(data.get('accountId') ?? '').trim() });
    setBusy(false);
    if (!r.ok) { setError(r.error.message); return; }
    saveSecret(bounty.id, 'claimSecret', r.value.claimSecret);
    setSecret({ value: r.value.claimSecret, bounty: r.value.bounty });
  }
  if (secret) return <SecretNotice title="Keep your claim secret" secret={secret.value}
    body="You need it to submit your route. It is shown once. This browser also remembers it." onDone={() => onChange(secret.bounty)} />;
  return (
    <form className={styles.form} onSubmit={submit} aria-label="Claim this bounty">
      <h2>Claim this bounty</h2>
      <label className={styles.field}>Your name<Input name="creatorName" required maxLength={80} autoComplete="name" /></label>
      <label className={styles.choice}><input type="radio" checked={mode === 'create'} onChange={() => setMode('create')} />
        <span>Open a payout account for me<br /><span className={styles.hint}>Creates a Nessie sandbox customer and checking account.</span></span></label>
      <label className={styles.choice}><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
        <span>I already have a Nessie account id</span></label>
      {mode === 'existing' && <label className={styles.field}>Nessie account id<Input name="accountId" required maxLength={64} autoComplete="off" spellCheck={false} /></label>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button type="submit" disabled={busy}>{busy ? 'Claiming…' : `Claim for ${usd(bounty.rewardUsd)}`}</Button>
    </form>
  );
}

function SubmitForm({ bounty, onChange }: { bounty: PublicBounty; onChange: (b: PublicBounty) => void }) {
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [routeId, setRouteId] = useState('');
  const [claimSecret, setClaimSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setClaimSecret(savedSecrets(bounty.id).claimSecret ?? '');
    let live = true;
    void httpCore.listRoutes().then((r) => { if (live) { if (r.ok) setRoutes(r.value.filter((x) => x.approvedVersion !== null)); else setError(r.error.message); } });
    return () => { live = false; };
  }, [bounty.id]);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    const r = await bountiesApi.submit(bounty.id, routeId, claimSecret.trim());
    setBusy(false);
    if (r.ok) onChange(r.value); else setError(r.error.message);
  }
  return (
    <form className={styles.form} onSubmit={submit} aria-label="Submit a route">
      <h2>Submit your route</h2>
      <p className={styles.meta}>Only approved routes can be submitted. <Link href={`/teach?bounty=${encodeURIComponent(bounty.id)}`} className="creator-nav">Teach a new route</Link> and approve it first, or pick one you already made.</p>
      <label className={styles.field}>Approved route
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)} required style={{ minHeight: 44 }}>
          <option value="">{routes === null ? 'Loading routes…' : routes.length ? 'Choose a route' : 'No approved routes yet'}</option>
          {routes?.map((r) => <option key={r.id} value={r.id}>{r.name} (v{r.approvedVersion})</option>)}
        </select></label>
      <label className={styles.field}>Claim secret
        <Input value={claimSecret} onChange={(e) => setClaimSecret(e.target.value)} required maxLength={200} autoComplete="off" spellCheck={false} /></label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <Button type="submit" disabled={busy || !routeId}>{busy ? 'Submitting…' : 'Submit route'}</Button>
    </form>
  );
}

function PosterPanel({ bounty, onChange }: { bounty: PublicBounty; onChange: (b: PublicBounty) => void }) {
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  useEffect(() => { setSecret(savedSecrets(bounty.id).posterSecret ?? ''); }, [bounty.id]);
  const uncertain = bounty.status === 'paying' && bounty.payout?.state === 'uncertain';
  async function run(label: string, fn: (s: string) => ReturnType<typeof bountiesApi.pay>) {
    if (busy) return; // a double click never sends a second request
    setBusy(true); setMessage(null);
    const r = await fn(secret.trim());
    setBusy(false);
    if (r.ok) { onChange(r.value); setMessage({ kind: 'ok', text: label }); } else { setMessage({ kind: 'error', text: r.error.message }); void bountiesApi.get(bounty.id).then((g) => g.ok && onChange(g.value)); }
  }
  const canPay = (bounty.status === 'submitted' || uncertain) && !!bounty.route;
  return (
    <section className={styles.form} aria-label="Poster actions">
      <h2>Poster actions</h2>
      <label className={styles.field}>Poster secret
        <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} maxLength={200} autoComplete="off" spellCheck={false} /></label>
      {canPay && !uncertain && <p className={styles.meta}>Approving sends {usd(bounty.rewardUsd)} of Nessie sandbox money to {bounty.claim?.creatorName} (account ending {bounty.claim?.accountLast4}).</p>}
      {uncertain && <div className="notice error">Nessie did not confirm the last payout, so it may already be applied. Check the funding account first. Retrying can pay twice.</div>}
      <div className="row">
        {canPay && <Button disabled={busy || !secret} onClick={() => void run('Paid.', (s) => bountiesApi.pay(bounty.id, s, uncertain))}>
          {busy ? 'Paying…' : uncertain ? 'Retry payout anyway' : `Approve & pay ${usd(bounty.rewardUsd)}`}</Button>}
        {bounty.status === 'submitted' && <Button variant="outline" disabled={busy || !secret} onClick={() => void run('Sent back to the creator.', (s) => bountiesApi.reject(bounty.id, s))}>Send route back</Button>}
        {(bounty.status === 'open' || bounty.status === 'claimed' || bounty.status === 'submitted') && !bounty.payout?.withdrawalId &&
          <Button variant="outline" disabled={busy || !secret} onClick={() => void run('Cancelled.', (s) => bountiesApi.cancel(bounty.id, s))}>Cancel bounty</Button>}
      </div>
      {message && <div className={`notice ${message.kind === 'ok' ? 'ok' : 'error'}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</div>}
    </section>
  );
}

/** Shown to the person who claimed this bounty in this browser: the claim secret is saved here. */
function TeachPrompt({ bounty }: { bounty: PublicBounty }) {
  const [mine, setMine] = useState(false);
  useEffect(() => { setMine(!!savedSecrets(bounty.id).claimSecret); }, [bounty.id, bounty.status]);
  if (bounty.status !== 'claimed' || !mine) return null;
  return (
    <section className={styles.card} aria-label="Teach this route">
      <h3>You took this request</h3>
      <p className={styles.meta}>Record a walk-through video of the route. Breadcrumb drafts the steps, you approve them, then you submit the route here to get paid.</p>
      <div className="row">
        <Button asChild><Link href={`/teach?bounty=${encodeURIComponent(bounty.id)}`}>Teach this route</Link></Button>
      </div>
    </section>
  );
}

export function BountyScreen({ id }: { id: string }) {
  const [bounty, setBounty] = useState<PublicBounty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const r = await bountiesApi.get(id);
    if (r.ok) setBounty(r.value); else setError(r.error.message);
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const [payments, setPayments] = useState(false);
  useEffect(() => { void bountiesApi.board().then((r) => r.ok && setPayments(r.value.payments.enabled)); }, []);

  const terminal = bounty?.status === 'paid' || bounty?.status === 'cancelled';
  return (
    <PageShell>
      <header>
        <SiteHeader current="bounties" />
        {bounty && <div className="route-title"><h1>{bounty.title}</h1></div>}
      </header>
      {error && <div className="notice error" role="alert"><p>{error}</p><Button variant="outline" onClick={() => void load()}>Retry</Button></div>}
      {!error && !bounty && <p role="status">Loading bounty…</p>}
      {bounty && (
        <div className={styles.layout}>
          <div className={styles.stack}>
            <div className="row"><StatusBadge bounty={bounty} /><span className={styles.reward}>{usd(bounty.rewardUsd)}</span></div>
            <p>{bounty.description}</p>
            <p className={styles.meta}>Posted by {bounty.poster}{bounty.claim ? ` · Claimed by ${bounty.claim.creatorName} (account ending ${bounty.claim.accountLast4})` : ''}</p>
            <TeachPrompt bounty={bounty} />
            {bounty.route && (
              <section className={styles.card} aria-label="Submitted route">
                <h3>{bounty.route.name}</h3>
                <p className={styles.meta}>Approved version {bounty.route.version}</p>
                <div className="row">
                  <Button variant="outline" size="sm" asChild><a href={`/follow/${encodeURIComponent(bounty.route.id)}?mode=stream`}>Open live voice guide</a></Button>
                  <Button variant="ghost" size="sm" asChild><Link href={`/teach?route=${encodeURIComponent(bounty.route.id)}`}>View route</Link></Button>
                </div>
              </section>
            )}
            {bounty.payout && <PayoutSummary bounty={bounty} />}
            {bounty.status === 'cancelled' && <p className="notice">This bounty was cancelled.</p>}
            {bounty.status === 'paying' && bounty.payout?.state === 'inflight' && <div className="row"><Button variant="outline" onClick={() => void load()}>Refresh status</Button></div>}
          </div>
          {payments && !terminal && (
            <div className={styles.stack}>
              {bounty.status === 'open' && <ClaimForm bounty={bounty} onChange={setBounty} />}
              {bounty.status === 'claimed' && <SubmitForm bounty={bounty} onChange={setBounty} />}
              <PosterPanel bounty={bounty} onChange={setBounty} />
            </div>
          )}
          {!payments && !terminal && <p className="notice">Payouts are not set up on this server, so this board is read-only.</p>}
        </div>
      )}
    </PageShell>
  );
}
