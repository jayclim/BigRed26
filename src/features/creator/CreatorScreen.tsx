'use client';
import { Button } from '@/ui/button';
import { Textarea } from '@/ui/textarea';
import { Badge } from '@/ui/badge';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { Checkpoint, CoreAdapter, Direction, Id, Result, Route } from '@contracts/contracts.ts';
import { DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import { Input } from '@/ui/input';
import { SiteHeader } from '@/ui/SiteHeader.tsx';
import type { PublicBounty } from '@/client/bounties.ts';
import { RouteMap } from '@/features/guide/RouteMap.tsx';
import { ActionEditor } from './ActionEditor.tsx';
import { BountyPanel } from './BountyPanel.tsx';
import { VideoUpload } from './VideoUpload.tsx';
import styles from './creator.module.css';

export interface CreatorScreenProps {
  core: CoreAdapter;
  /** A stored route to edit. Without it the screen starts a new route from a video. */
  routeId?: Id;
  /** Path of the visitor guide for the edited route, e.g. /follow/my-route */
  followPath?: string;
  /** The bounty this route answers. Names a new draft after it and offers "Submit to bounty" once approved. */
  bounty?: { id: Id; loaded: PublicBounty | null; error?: string | null };
  /** Called once when a new route's first draft opens, so the page can put the route id in the URL. */
  onRouteCreated?: (route: Route) => void;
}

const DIRECTIONS: Direction[] = ['forward', 'left', 'right', 'up', 'down'];

export function CreatorScreen({ core, routeId, followPath, bounty, onRouteCreated }: CreatorScreenProps) {
  const reduceMotion = useReducedMotion();
  const [route, setRoute] = useState<Route | null>(null);
  const [saved, setSaved] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [guidePath, setGuidePath] = useState(followPath ?? '');

  const [extracting, setExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [guardMedia, setGuardMedia] = useState<Id | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Route | null>(null);
  const request = useRef<AbortController | null>(null);
  const token = useRef(0);
  const edits = useRef(0);
  const retryMedia = useRef<Id | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const extractionNotice = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const openId = useRef<Id | null>(null); // id of the route on screen, so a URL that catches up with a new draft does not reload it
  const prefillName = useRef<string | null>(null);
  prefillName.current = bounty?.loaded?.title ?? null;

  function clearExtraction() {
    token.current++;
    request.current?.abort(); request.current = null;
    retryMedia.current = null;
    setExtracting(false); setExtractionError(null); setGuardMedia(null); setPendingDraft(null);
  }

  function openDraft(draft: Route) {
    const named = prefillName.current && draft.name !== prefillName.current;
    openId.current = draft.id;
    setRoute(named ? { ...draft, name: prefillName.current! } : draft);
    if (named) edits.current++;
    setSaved(!named);
    setGuidePath(`/follow/${draft.id}`); setPendingDraft(null);
    setMsg({ kind: 'ok', text: named ? 'Draft created and named after the bounty. Review the steps, then approve.' : 'Draft created. Review the steps, then approve.' });
    focusHeading.current = true;
    onRouteCreated?.(draft);
  }

  async function extract(mediaId: Id) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const currentToken = ++token.current;
    const currentEdits = edits.current;
    retryMedia.current = mediaId;
    setGuardMedia(null); setExtractionError(null); setPendingDraft(null); setExtracting(true);
    try {
      const response = await fetch(`/api/media/${encodeURIComponent(mediaId)}/extract`, {
        method: 'POST', signal: controller.signal,
      });
      const result: Result<Route> = await response.json();
      if (currentToken !== token.current || controller.signal.aborted) return;
      if (!result.ok) setExtractionError(result.error.message);
      else if (!response.ok) setExtractionError('The draft could not be created. Retry the video.');
      else if (edits.current !== currentEdits) setPendingDraft(result.value);
      else openDraft(result.value);
    } catch {
      if (currentToken === token.current && !controller.signal.aborted)
        setExtractionError('The draft could not be created. Check your connection and retry.');
    } finally {
      if (currentToken === token.current) { request.current = null; setExtracting(false); }
    }
  }

  function requestExtraction(mediaId: Id) {
    if (request.current || busy || pendingDraft) return;
    if (!saved) { setExtractionError(null); setGuardMedia(mediaId); }
    else void extract(mediaId);
  }

  useEffect(() => {
    if (focusHeading.current) { focusHeading.current = false; heading.current?.focus(); heading.current?.scrollIntoView({ block: 'center' }); }
  }, [route]);
  useEffect(() => {
    if (extractionError || guardMedia || pendingDraft) {
      extractionNotice.current?.focus(); extractionNotice.current?.scrollIntoView({ block: 'center' });
    }
  }, [extractionError, guardMedia, pendingDraft]);

  useEffect(() => () => { token.current++; request.current?.abort(); request.current = null; }, []); // leaving the page cancels extraction
  useEffect(() => {
    setOrigin(window.location.origin);
    if (!routeId) return; // a new route: the first extracted draft opens it
    if (openId.current === routeId) return; // the URL caught up with a draft opened here; keep its unsaved edits
    let active = true;
    clearExtraction();
    core.getRoute(routeId).then((r) => {
      if (!active) return;
      if (r.ok) { openId.current = r.value.id; setRoute(r.value); setSaved(true); setGuidePath(followPath ?? `/follow/${encodeURIComponent(routeId)}`); }
      else setMsg({ kind: 'error', text: r.error.message });
    });
    return () => { active = false; token.current++; request.current?.abort(); request.current = null; };
  }, [core, routeId, followPath]);

  // Keep notices in flow until their exit completes; never animate their height.
  const noticeMotion = {
    initial: reduceMotion ? false as const : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -4, transition: { duration: reduceMotion ? 0 : 0.12, ease: 'easeIn' as const } },
    transition: { duration: reduceMotion ? 0 : 0.16 },
  };

  function editRoute(patch: Partial<Pick<Route, 'name' | 'startDescription' | 'destinationLabel'>>) {
    setRoute((r) => r && { ...r, ...patch });
    edits.current++; setSaved(false);
    setMsg(null);
  }

  async function save() {
    if (!route) return false;
    const revision = edits.current;
    const routeToken = token.current;
    const r = await core.saveDraft(route);
    if (routeToken !== token.current) return false;
    if (!r.ok) { setMsg({ kind: 'error', text: r.error.message }); return false; }
    if (revision !== edits.current) { setMsg({ kind: 'ok', text: 'Earlier edits saved. Save your latest changes before continuing.' }); return false; }
    setRoute(r.value); setSaved(true);
    return true;
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg(null);
    try { await fn(); } finally { setBusy(false); }
  }


  const notices = (
      <AnimatePresence initial={false}>
    {extracting && <motion.div key="extracting" {...noticeMotion} className="notice" role="status">
      <p>Creating a draft from your video… this can take a minute</p>
      <Button variant="outline" onClick={() => { clearExtraction(); setMsg({ kind: 'ok', text: 'Draft creation canceled. Your current route is unchanged.' }); }}>Cancel</Button>
    </motion.div>}
    {(extractionError || guardMedia || pendingDraft) && <motion.div key="extraction-notice" {...noticeMotion} ref={extractionNotice} tabIndex={-1}
      className={`notice extraction-notice${extractionError ? ' error' : ''}`} role={extractionError ? 'alert' : 'status'}>
      {extractionError && <>
        <p>{extractionError}</p>
        <div className="row">
          <Button disabled={busy} onClick={() => retryMedia.current && requestExtraction(retryMedia.current)}>Retry</Button>
          <Button variant="outline" onClick={() => setExtractionError(null)}>Dismiss</Button>
        </div>
      </>}
      {guardMedia && <>
        <p>Your draft has unsaved edits. Choose how to continue.</p>
        <div className="row">
          <Button disabled={busy} onClick={() => run(async () => { if (await save()) await extract(guardMedia); })}>Save draft first</Button>
          <Button variant="outline" disabled={busy} onClick={() => extract(guardMedia)}>Discard edits and create draft</Button>
          <Button variant="outline" disabled={busy} onClick={() => setGuardMedia(null)}>Keep my edits</Button>
        </div>
      </>}
      {pendingDraft && <>
        <p>A new draft is ready. You edited the current draft during creation. Choose which draft to keep open.</p>
        <div className="row">
          <Button disabled={busy} onClick={() => openDraft(pendingDraft)}>Open new draft (discard my edits)</Button>
          <Button variant="outline" disabled={busy} onClick={() => setPendingDraft(null)}>Keep my edits</Button>
        </div>
      </>}
    </motion.div>}
    </AnimatePresence>
  );

  if (!route && routeId) return <main className={`creator ${styles.page}`}><div className={styles.inner}>{msg ? <p className="notice error">{msg.text}</p> : <p>Loading route…</p>}</div></main>;

  if (!route) return (
    <main className={`creator ${styles.page}`}>
      <div className={`creator-glow ${styles.glow}`} aria-hidden="true" />
      <div className={styles.inner}>
        <header>
          <SiteHeader current="teach" />
          <div className="route-title"><h1 ref={heading} tabIndex={-1}>Teach a route</h1></div>
          <p className="notice">Record a walk-through of a short indoor route. Breadcrumb drafts the steps from your video; you review them and approve with one click.</p>
        </header>
        {bounty && <div className={styles.prompt}><BountyPanel bountyId={bounty.id} bounty={bounty.loaded} loadError={bounty.error ?? null} route={null} /></div>}
        <div className={styles.prompt}>
          <VideoUpload onCreateDraft={requestExtraction} onSelectionChange={clearExtraction} extractionBusy={extracting}
            extractionDisabled={busy || !!guardMedia || !!pendingDraft} />
        </div>
        <section className={`creator-route ${styles.prompt}`} aria-label="Draft status">{notices}</section>
      </div>
    </main>
  );

  const approved = route.status === 'approved';

  function edit(id: Id, patch: Partial<Checkpoint>) {
    setRoute((r) => r && { ...r, checkpoints: r.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    edits.current++; setSaved(false);
    setMsg(null);
  }

  const approve = () => run(async () => {
    if (!saved && !(await save())) return;
    const r = await core.approveRoute(route.id, route.version, route.checkpoints.map((c) => c.id));
    if (!r.ok) return setMsg({ kind: 'error', text: r.error.message });
    setRoute(r.value);
    setMsg({ kind: 'ok', text: `Version ${r.value.version} approved. New guide sessions use it.` });
  });

  const saveDraft = () => run(async () => { if (await save()) setMsg({ kind: 'ok', text: 'Draft saved.' }); });

  function startNewVersion() {
    clearExtraction(); edits.current++;
    setRoute({ ...route!, version: route!.version + 1, status: 'draft' });
    setSaved(false);
    setMsg({ kind: 'ok', text: `Editing version ${route!.version + 1}. Version ${route!.version} stays live until you approve this one.` });
  }

  const shareUrl = `${origin}${guidePath}`;

  return (
    <main className={`creator ${styles.page}`}>
      {/* Static decorative glow; no motion. */}
      <div className={`creator-glow ${styles.glow}`} aria-hidden="true" />
      <div className={styles.inner}>
      <header>
        <SiteHeader current="teach">
          <AnimatePresence initial={false} mode="wait">
            <motion.span key={`${route.status}-${saved}`} {...noticeMotion}>
              <Badge variant={approved ? 'success' : 'secondary'} className="status" data-status={route.status}>
                {approved ? `Approved · v${route.version}` : `Draft · v${route.version}${saved ? '' : ' · Unsaved'}`}
              </Badge>
            </motion.span>
          </AnimatePresence>
        </SiteHeader>
        <div className="route-title">
          <h1 ref={heading} tabIndex={-1}>{route.name}</h1>
        </div>
        <dl className="route-summary">
          <div><dt>Start</dt><dd>{route.startDescription}</dd></div>
          <div><dt>Destination</dt><dd>{route.destinationLabel}</dd></div>
        </dl>
        <p className="notice">{approved ? 'Route from your video. You approved this version.' : 'Draft from your video. Review the steps; nothing is approved yet.'}</p>
      </header>

      {bounty && <div className={styles.prompt}><BountyPanel bountyId={bounty.id} bounty={bounty.loaded} loadError={bounty.error ?? null} route={route} /></div>}
      <div className={styles.prompt}>
        <VideoUpload onCreateDraft={requestExtraction} onSelectionChange={clearExtraction} extractionBusy={extracting}
          extractionDisabled={busy || !!guardMedia || !!pendingDraft} />
      </div>

      <div className="creator-body">
        <section className="creator-route" aria-label="Review route">

      {notices}

      {approved && (
        <section className="share" aria-labelledby="share-h">
          <h2 id="share-h">Visitor link</h2>
          <code>{shareUrl}</code>
          <p className="meta" style={{ margin: 0, color: 'var(--muted)' }}>
            Works in a browser on this computer. A phone needs this app served over HTTPS for camera access; see the README.
          </p>
          <div className="row">
            <Button asChild><a href={guidePath}>Open guide</a></Button>
            <Button variant="outline" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy link</Button>
            <Button variant="outline" onClick={startNewVersion}>Edit as version {route.version + 1}</Button>
          </div>
        </section>
      )}

      {!approved && (
        <section className="step route-details" aria-labelledby="details-h">
          <h2 id="details-h">Route details</h2>
          <label>Route name
            <Input value={route.name} maxLength={200} onChange={(e) => editRoute({ name: e.target.value })} /></label>
          <label>Start
            <Input value={route.startDescription} maxLength={500} onChange={(e) => editRoute({ startDescription: e.target.value })} /></label>
          <label>Destination
            <Input value={route.destinationLabel} maxLength={200} onChange={(e) => editRoute({ destinationLabel: e.target.value })} /></label>
        </section>
      )}

      <div className="section-heading">
        <div><h2>{approved ? 'Approved route' : 'Review checkpoints'}</h2><p>{approved ? 'This version is ready for visitors.' : 'Review the instructions in both languages before approving.'}</p></div>
        <Badge variant="outline">{route.checkpoints.length} steps</Badge>
      </div>
      <ol className="trail" aria-label="Route checkpoints in walking order">
        {route.checkpoints.map((c, i) => (
          <li key={c.id} data-reviewed={approved} style={{ animationDelay: `${Math.min((i + 2) * 32, 160)}ms` }}>
            <div className={`node${c.isDestination ? ' dest' : ''}`} aria-hidden="true">{i + 1}</div>
            <article className="step" aria-labelledby={`cp-${c.id}`}>
              <h2 id={`cp-${c.id}`}>
                {c.label}
                {c.isDestination
                  ? <span className="dir-tag">Destination</span>
                  : c.direction && <span className="dir-tag">{DIRECTION_TEXT.en[c.direction]}</span>}
              </h2>
              <p className="meta">
                Recognized by: {c.identifyingEvidence.join('; ') || 'nothing recorded'}. Approach: {c.approachDescription || 'not described'}.
              </p>
              <div className="langs">
                <label>
                  English instruction
                  <Textarea value={c.instruction.en} disabled={approved} className="disabled:opacity-100 disabled:bg-secondary"
                    onChange={(e) => edit(c.id, { instruction: { ...c.instruction, en: e.target.value } })} />
                </label>
                <label>
                  Spanish instruction
                  <Textarea lang="es" value={c.instruction.es} disabled={approved} className="disabled:opacity-100 disabled:bg-secondary"
                    onChange={(e) => edit(c.id, { instruction: { ...c.instruction, es: e.target.value } })} />
                </label>
              </div>
              {!c.isDestination && (
                <label>
                  Direction at this checkpoint
                  <select value={c.direction ?? ''} disabled={approved}
                    onChange={(e) => edit(c.id, { direction: (e.target.value || null) as Direction | null })}>
                    <option value="">Not set</option>
                    {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_TEXT.en[d]}</option>)}
                  </select>
                </label>
              )}
              {!c.isDestination && <ActionEditor action={c.action} disabled={approved || busy}
                onChange={(action) => edit(c.id, { action })} />}
            </article>
          </li>
        ))}
      </ol>

        </section>
        <aside className="creator-sidebar" aria-label="Route preview">
          <div className={`route-preview ${styles.preview}`}>
            <RouteMap checkpoints={route.checkpoints} current={-1} guiding={false} flow={false} reduced={!!reduceMotion}
              statuses={route.checkpoints.map(() => (approved ? 'approved' : 'draft'))}
              locale="en" name={route.name} title="Route preview" note="Not to scale" />
            <p className={styles.previewNote}>{approved
              ? `Drawn from the checkpoints of approved version ${route.version}.`
              : 'Drawn from the current draft checkpoints. This draft is not approved.'}</p>
          </div>
        </aside>
      </div>
      </div>
      <div className="approve-bar" aria-live="polite">
        {!approved && (
          <>
            <Button variant="outline" onClick={saveDraft} disabled={busy || extracting || saved}>Save draft</Button>
            <Button onClick={approve} disabled={busy || extracting || !!pendingDraft || !!guardMedia}>
              Approve version {route.version}
            </Button>
            <span style={{ color: 'var(--muted)' }}>
              Approving makes version {route.version} live for visitors.
            </span>
          </>
        )}
        <AnimatePresence initial={false} mode="wait">
          {msg && <motion.p key={`${msg.kind}:${msg.text}`} {...noticeMotion} className={`notice ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0 }}>{msg.text}</motion.p>}
        </AnimatePresence>
      </div>
    </main>
  );
}
