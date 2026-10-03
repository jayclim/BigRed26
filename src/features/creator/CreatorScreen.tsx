'use client';
import { useEffect, useState } from 'react';
import type { Checkpoint, CoreAdapter, Direction, Id, Route } from '@contracts/contracts.ts';
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

  useEffect(() => {
    setOrigin(window.location.origin);
    core.getRoute(routeId).then((r) => (r.ok ? setRoute(r.value) : setMsg({ kind: 'error', text: r.error.message })));
  }, [core, routeId]);

  if (!route) return <main className="creator">{msg ? <p className="notice error">{msg.text}</p> : <p>Loading route…</p>}</main>;

  const approved = route.status === 'approved';
  const allReviewed = route.checkpoints.every((c) => reviewed.has(c.id));

  function edit(id: Id, patch: Partial<Checkpoint>) {
    setRoute((r) => r && { ...r, checkpoints: r.checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    setReviewed((s) => { const n = new Set(s); n.delete(id); return n; }); // an edit needs a fresh review
    setSaved(false);
    setMsg(null);
  }

  async function save() {
    if (!route) return false;
    const r = await core.saveDraft(route);
    if (!r.ok) { setMsg({ kind: 'error', text: r.error.message }); return false; }
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
    setRoute({ ...route!, version: route!.version + 1, status: 'draft' });
    setReviewed(new Set()); setSaved(false);
    setMsg({ kind: 'ok', text: `Editing version ${route!.version + 1}. Version ${route!.version} stays live until you approve this one.` });
  }

  const shareUrl = `${origin}${guidePath}`;

  const loadActionFixture = () => run(async () => {
    let r = await core.getRoute(actionFixture.route.id);
    // Explicit fixture selection can add this draft to an older store. No existing route is changed.
    if (!r.ok && r.error.code === 'NOT_FOUND') r = await core.saveDraft(actionFixture.route as Route);
    if (!r.ok) return setMsg({ kind: 'error', text: r.error.message });
    setRoute(r.value); setSaved(true); setReviewed(new Set());
    setGuidePath(`/follow/${r.value.id}`);
  });

  return (
    <main className="creator">
      <header>
        <div className="creator-top">
          <Brand />
          <span className="mock-badge">Mock route</span>
        </div>
        <span className="status" data-status={route.status}>
          {approved ? `Approved, version ${route.version}` : `Draft, version ${route.version}${saved ? '' : ' (unsaved changes)'}`}
        </span>
        <h1>{route.name}</h1>
        <p className="lede">
          Start: {route.startDescription}. Destination: {route.destinationLabel}.
        </p>
        <p className="notice">Fictional mock fixture; no video was recorded. Check each step, then approve. Fixture success is not field or terrain-safety evidence.</p>
        {route.id !== actionFixture.route.id && <button className="btn" disabled={busy || !saved} onClick={loadActionFixture}>Review detailed-action mock fixture</button>}
      </header>

      <VideoUpload />

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
            <button className="btn" onClick={saveDraft} disabled={busy || saved}>Save draft</button>
            <button className="btn btn-primary" onClick={approve} disabled={busy || !allReviewed}>
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
