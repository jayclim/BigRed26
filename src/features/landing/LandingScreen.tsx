'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { RouteSummary } from '@contracts/contracts.ts';
import { bountiesApi, type Board } from '@/client/bounties.ts';
import { httpCore } from '@/client/httpCore.ts';
import { BountyCard } from '@/app/bounties/BoardScreen.tsx';
import { PostBountyDialog } from '@/app/bounties/PostBountyDialog.tsx';
import { usd } from '@/app/bounties/shared.tsx';
import { RouteCard } from '@/app/routes/RouteCard.tsx';
import { Button } from '@/ui/button';
import { PageShell } from '@/ui/PageShell.tsx';
import { SiteHeader } from '@/ui/SiteHeader.tsx';
import bountyStyles from '@/app/bounties/bounties.module.css';
import styles from './landing.module.css';

const STEPS = [
  { title: 'Teach', text: 'Walk a short indoor route once and record it. Breadcrumb drafts the checkpoints from your video. You review them and approve in one click.' },
  { title: 'Follow with a live voice', text: 'Open the link on a phone. A voice guide watches your camera and says where to go next, in 25 languages.' },
  { title: 'Earn with bounties', text: 'Post a bounty for a route you need, or take one. Teach the route, the poster approves it, and you get paid in Capital One Nessie sandbox money.' },
];

/** `+1 607 555 0100` or an Apple ID email. The sms: scheme opens Messages for both. */
const smsHref = (contact: string) => `sms:${contact.includes('@') ? contact.trim() : contact.replace(/[\s().-]/g, '')}`;

export function LandingScreen({ agentContact }: { agentContact: string | null }) {
  const [origin, setOrigin] = useState('');
  const [routes, setRoutes] = useState<RouteSummary[] | null>(null);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    setRoutesError(null);
    const r = await httpCore.listRoutes();
    if (r.ok) setRoutes(r.value); else setRoutesError(r.error.message);
  }, []);
  const loadBoard = useCallback(async () => {
    setBoardError(null);
    const r = await bountiesApi.board();
    if (r.ok) setBoard(r.value); else setBoardError(r.error.message);
  }, []);
  useEffect(() => { setOrigin(window.location.origin); void loadRoutes(); void loadBoard(); }, [loadRoutes, loadBoard]);

  const approved = routes?.filter((r) => r.approvedVersion !== null) ?? [];
  const drafts = routes?.filter((r) => r.approvedVersion === null) ?? [];
  const open = board?.bounties.filter((b) => b.status === 'open') ?? [];
  const canPost = !!board?.payments.enabled;

  return (
    <PageShell>
      <header><SiteHeader /></header>

      <section className={styles.hero} aria-labelledby="hero-h">
        <p className={styles.kicker}>Indoor routes with a live voice guide</p>
        <h1 id="hero-h">Lost indoors? Follow a voice that can see.</h1>
        <p className={styles.lead}>
          Breadcrumb turns one walk-through video into a guided route. A live voice watches your camera and tells you the next step, so you can find the room, the lift or the exit without a map.
        </p>
        <div className={styles.cta}>
          <Button asChild><a href="#routes">Find a route</a></Button>
          <Button variant="outline" asChild><Link href="/teach">Teach a route</Link></Button>
        </div>
        <p className={styles.sub}>Need a route nobody has taught yet? <a href="#bounties">Post a bounty</a>.</p>
        <div className={styles.guide} aria-hidden="true">
          <div className={styles.guideTop}><span className={styles.live}>Live</span><span>25 languages</span></div>
          <p className={styles.guideText}>Walk past the elevators and turn left at the water fountain.</p>
          <div className={styles.trail}><i /><i /><i data-on="" /><i data-end="" /></div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="how-h">
        <div className={styles.sectionHead}><div><h2 id="how-h">How it works</h2></div></div>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className={styles.node} aria-hidden="true">{i + 1}</span>
              <div><h3>{s.title}</h3><p>{s.text}</p></div>
            </li>
          ))}
        </ol>
        <p className={styles.text}>
          <strong>Prefer texting?</strong> Message our iMessage agent something like “how do I get to the study room” and it replies with the guide link.
          {agentContact && <> Text <a href={smsHref(agentContact)}>{agentContact}</a>.</>}
        </p>
      </section>

      <section id="routes" className={styles.section} aria-labelledby="routes-h">
        <div className={styles.sectionHead}>
          <div><h2 id="routes-h">Routes</h2><p>Approved routes anyone can follow. Open the live voice guide, or copy a link to share.</p></div>
          <Button variant="outline" asChild><Link href="/teach">Teach a route</Link></Button>
        </div>
        {routesError && <div className="notice error" role="alert"><p>{routesError}</p><Button variant="outline" onClick={() => void loadRoutes()}>Retry</Button></div>}
        {!routesError && routes === null && <p role="status">Loading routes…</p>}
        {routes && approved.length === 0 && <p className={styles.empty}>No approved routes yet. <Link href="/teach">Teach the first one</Link>.</p>}
        {approved.length > 0 && <ul className="route-list" aria-label="Approved routes">{approved.map((r) => <RouteCard key={r.id} route={r} origin={origin} />)}</ul>}
        {drafts.length > 0 && (
          <div className={styles.drafts}>
            <h3>Drafts</h3>
            <p className={styles.meta}>Drafts have no visitor link. Review and approve one to publish it.</p>
            <ul className={styles.draftList} aria-label="Draft routes">{drafts.map((r) => <RouteCard key={r.id} route={r} origin={origin} compact />)}</ul>
          </div>
        )}
      </section>

      <section id="bounties" className={styles.section} aria-labelledby="bounties-h">
        <div className={styles.sectionHead}>
          <div>
            <h2 id="bounties-h">Open bounties</h2>
            <p>Ask for a route and set a reward. Someone teaches it, you approve it, and they get paid. Rewards are Capital One Nessie sandbox money, not real dollars.</p>
          </div>
          {canPost && board && <PostBountyDialog board={board} onPosted={() => void loadBoard()} />}
        </div>
        {boardError && <div className="notice error" role="alert"><p>{boardError}</p><Button variant="outline" onClick={() => void loadBoard()}>Retry</Button></div>}
        {!boardError && !board && <p role="status">Loading bounties…</p>}
        {board && !canPost && <p className="notice">Payouts are not set up on this server, so the board is read-only.</p>}
        {board && (
          <>
            <dl className={`${bountyStyles.stats} ${styles.stats}`} aria-label="Bounty totals">
              <div><dt>Open</dt><dd>{open.length}</dd></div>
              <div><dt>Paid out here</dt><dd>{usd(board.paidOutUsd)}</dd></div>
            </dl>
            {open.length === 0
              ? <p className={styles.empty}>No open bounties yet.{canPost && ' Post the first one.'}</p>
              : <ul className={bountyStyles.list} aria-label="Open bounties">{open.map((b) => <BountyCard key={b.id} b={b} />)}</ul>}
            <p className={styles.meta}><Link href="/bounties">See claimed and paid bounties</Link></p>
          </>
        )}
      </section>

      <footer className={styles.footer}>
        <p>Breadcrumb. Teach a route once. Anyone can follow it.</p>
      </footer>
    </PageShell>
  );
}
