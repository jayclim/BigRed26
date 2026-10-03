'use client';
import { useEffect, useRef, useState } from 'react';
import type { Checkpoint, CoreAdapter, Direction, Id, Result, Route } from '@contracts/contracts.ts';
import { DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import { Brand } from '@/ui/Brand.tsx';
import actionFixture from '@contracts/fixture.actions.v1.json';
import { ActionEditor } from './ActionEditor.tsx';
import { VideoUpload } from './VideoUpload.tsx';

export interface CreatorScreenProps {
  core: CoreAdapter;
  routeId: Id;
  /** Path of the visitor guide for this route, e.g. /follow/demo-route */
  followPath: string;
}

const DIRECTIONS: Direction[] = ['forward', 'left', 'right', 'up', 'down'];

export function CreatorScreen({ core, routeId, followPath }: CreatorScreenProps) {
  const [route, setRoute] = useState<Route | null>(null);
  const [saved, setSaved] = useState(true);
  const [reviewed, setReviewed] = useState<Set<Id>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [guidePath, setGuidePath] = useState(followPath);

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

  function clearExtraction() {
    token.current++;
    request.current?.abort(); request.current = null;
    setExtracting(false); setExtractionError(null); setGuardMedia(null); setPendingDraft(null);
  }

  function openDraft(draft: Route) {
    setRoute(draft); setSaved(true); setReviewed(new Set());
    setGuidePath(`/follow/${draft.id}`); setPendingDraft(null);
    setMsg({ kind: 'ok', text: 'Draft created. Check every step before approving.' });
    focusHeading.current = true;
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

  useEffect(() => {
    let active = true;
    clearExtraction();
    setOrigin(window.location.origin);
    core.getRoute(routeId).then((r) => {
      if (!active) return;
      if (r.ok) { setRoute(r.value); setSaved(true); setReviewed(new Set()); setGuidePath(followPath); }
      else setMsg({ kind: 'error', text: r.error.message });
    });
    return () => { active = false; token.current++; request.current?.abort(); request.current = null; };
  }, [core, routeId, followPath]);

  if (!route) return <main className="creator">{msg ? <p className="notice error">{msg.text}</p> : <p>Loading route…</p>}</main>;

  const approved = route.status === 'approved';
  const fixtureRoute = route.id === 'demo-route' || route.id === actionFixture.route.id;
  const allReviewed = route.checkpoints.every((c) => reviewed.has(c.id));

  function edit(id: Id, patch: Partial<Checkpoint>) {
    setRoute((r) => r && { ...r, checkpoints: r.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    setReviewed((s) => { const n = new Set(s); n.delete(id); return n; }); // an edit needs a fresh review
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

  const approve = () => run(async () => {
    if (!saved && !(await save())) return;
    const r = await core.approveRoute(route.id, route.version, [...reviewed]);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error.message });
    setRoute(r.value);
    setMsg({ kind: 'ok', text: `Version ${r.value.version} approved. New guide sessions use it.` });
  });

  const saveDraft = () => run(async () => { if (await save()) setMsg({ kind: 'ok', text: 'Draft saved.' }); });

  function startNewVersion() {
    clearExtraction(); edits.current++;
    setRoute({ ...route!, version: route!.version + 1, status: 'draft' });
    setReviewed(new Set()); setSaved(false);
    setMsg({ kind: 'ok', text: `Editing version ${route!.version + 1}. Version ${route!.version} stays live until you approve this one.` });
  }

  const shareUrl = `${origin}${guidePath}`;

  const loadActionFixture = () => {
    clearExtraction();
    return run(async () => {
      let r = await core.getRoute(actionFixture.route.id);
      // Explicit fixture selection can add this draft to an older store. No existing route is changed.
      if (!r.ok && r.error.code === 'NOT_FOUND') r = await core.saveDraft(actionFixture.route as Route);
      if (!r.ok) return setMsg({ kind: 'error', text: r.error.message });
      setRoute(r.value); setSaved(true); setReviewed(new Set());
      setGuidePath(`/follow/${r.value.id}`);
    });
  };

  return (
    <main className="creator">
      <header>
        <div className="creator-top">
          <Brand />
          {fixtureRoute && <span className="mock-badge">Mock route</span>}
        </div>
        <span className="status" data-status={route.status}>
          {approved ? `Approved, version ${route.version}` : `Draft, version ${route.version}${saved ? '' : ' (unsaved changes)'}`}
        </span>
        <h1 ref={heading} tabIndex={-1}>{route.name}</h1>
        <p className="lede">
          Start: {route.startDescription}. Destination: {route.destinationLabel}.
        </p>
        <p className="notice">{fixtureRoute
          ? 'Fictional mock fixture; no video was recorded. Check each step, then approve. Fixture success is not field or terrain-safety evidence.'
          : approved ? 'Route from your video. You approved this version after checking every step.' : 'Draft from your video. Check every step; nothing is approved yet.'}</p>
        {route.id !== actionFixture.route.id && <button className="btn" disabled={busy || !saved} onClick={loadActionFixture}>Review detailed-action mock fixture</button>}
      </header>

      <VideoUpload onCreateDraft={requestExtraction} extractionBusy={extracting}
        extractionDisabled={busy || !!guardMedia || !!pendingDraft} />
      {extracting && <div className="notice" role="status">
        <p>Creating a draft from your video… this can take a minute</p>
        <button className="btn" onClick={() => { clearExtraction(); setMsg({ kind: 'ok', text: 'Draft creation canceled. Your current route is unchanged.' }); }}>Cancel</button>
      </div>}
      {(extractionError || guardMedia || pendingDraft) && <div ref={extractionNotice} tabIndex={-1}
        className={`notice extraction-notice${extractionError ? ' error' : ''}`} role={extractionError ? 'alert' : 'status'}>
        {extractionError && <>
          <p>{extractionError}</p>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} onClick={() => retryMedia.current && requestExtraction(retryMedia.current)}>Retry</button>
            <button className="btn" onClick={() => setExtractionError(null)}>Dismiss</button>
          </div>
        </>}
        {guardMedia && <>
          <p>Your draft has unsaved edits. Choose how to continue.</p>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} onClick={() => run(async () => { if (await save()) await extract(guardMedia); })}>Save draft first</button>
            <button className="btn" disabled={busy} onClick={() => extract(guardMedia)}>Discard edits and create draft</button>
            <button className="btn" disabled={busy} onClick={() => setGuardMedia(null)}>Keep my edits</button>
          </div>
        </>}
        {pendingDraft && <>
          <p>A new draft is ready. You edited the current draft during creation. Choose which draft to keep open.</p>
          <div className="row">
            <button className="btn btn-primary" disabled={busy} onClick={() => openDraft(pendingDraft)}>Open new draft (discard my edits)</button>
            <button className="btn" disabled={busy} onClick={() => setPendingDraft(null)}>Keep my edits</button>
          </div>
        </>}
      </div>}

      {approved && (
        <section className="share" aria-labelledby="share-h">
          <h2 id="share-h">Visitor link</h2>
          <code>{shareUrl}</code>
          <p className="meta" style={{ margin: 0, color: 'var(--muted)' }}>
            Works in a browser on this computer. A phone needs this app served over HTTPS for camera access; see the README.
          </p>
          <div className="row">
            <a className="btn btn-primary" href={guidePath}>Open guide</a>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(shareUrl)}>Copy link</button>
            <button className="btn" onClick={startNewVersion}>Edit as version {route.version + 1}</button>
          </div>
        </section>
      )}

      <ol className="trail" aria-label="Route checkpoints in walking order">
        {route.checkpoints.map((c, i) => (
          <li key={c.id}>
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
                  <textarea value={c.instruction.en} disabled={approved}
                    onChange={(e) => edit(c.id, { instruction: { ...c.instruction, en: e.target.value } })} />
                </label>
                <label>
                  Spanish instruction
                  <textarea lang="es" value={c.instruction.es} disabled={approved}
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
              {!approved && (
                <label className="review">
                  <input type="checkbox" checked={reviewed.has(c.id)}
                    onChange={(e) => setReviewed((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                  I checked this step
                </label>
              )}
            </article>
          </li>
        ))}
      </ol>

      <div className="approve-bar" aria-live="polite">
        {!approved && (
          <>
            <button className="btn" onClick={saveDraft} disabled={busy || extracting || saved}>Save draft</button>
            <button className="btn btn-primary" onClick={approve} disabled={busy || extracting || !!pendingDraft || !!guardMedia || !allReviewed}>
              Approve version {route.version}
            </button>
            <span style={{ color: 'var(--muted)' }}>
              {reviewed.size} of {route.checkpoints.length} steps checked
            </span>
          </>
        )}
        {msg && <p className={`notice ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'} style={{ margin: 0 }}>{msg.text}</p>}
      </div>
    </main>
  );
}
