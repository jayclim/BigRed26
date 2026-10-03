'use client';
import { useEffect, useRef, useState } from 'react';
import type { CoreAdapter, Guidance, Id, Locale, Mode, Route, Session } from '@contracts/contracts.ts';
import { Arrow, DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import { mockScenes } from '@/shared/mockScenes.ts';
import actionFixture from '@contracts/fixture.actions.v1.json';
import { Brand } from '@/ui/Brand.tsx';
import { Camera } from './Camera.tsx';
import { uploadFrame as realUploadFrame } from '@/client/frameUpload.ts';
import { checkView } from './checkView.ts';
import styles from './mode.module.css';
import { reconcileGuide } from './reconcileGuide.ts';

export interface GuideScreenProps {
  core: CoreAdapter;
  mode?: Mode;
  uploadFrame?: typeof realUploadFrame;
  routeId: Id;
  /** Where Exit goes, e.g. the creator page */
  exitHref: string;
}

const T = {
  en: {
    mock: 'Mock', replay: 'Replay', live: 'Live',
    notes: { mock: 'Camera not analyzed', replay: 'Recorded frames, not a live camera', live: 'Frames you check are sent to the server for recognition' },
    soundOn: 'Sound on', soundOff: 'Sound off', other: 'Español', exit: 'Exit',
    start: (d: string) => `Start at the entrance: ${d}.`, startLabel: 'Ready',
    guiding: (l: string) => `At ${l}`, uncertain: 'Not sure where you are', off_route: 'Off the recorded route',
    reorient: "Check which way you're facing", arrived: 'Destination confirmed',
    problem: "Couldn't check that view. Your last confirmed step still stands.", evidence: 'Why',
    notApproved: "This route isn't approved yet. Ask the organizer to review and approve it.", again: 'Start a new walk',
    speech: 'Browser speech',
    target: 'Target', side: 'Side', left: 'left', right: 'right', floor: 'Floor', completion: 'Completion',
    manual: "I've done this (manual)", active: 'Active action — check your view before continuing',
  },
  es: {
    mock: 'Simulado', replay: 'Repetición', live: 'En vivo',
    notes: { mock: 'La cámara no se analiza', replay: 'Fotogramas grabados, no una cámara en vivo', live: 'Las vistas que compruebas se envían al servidor para su reconocimiento' },
    soundOn: 'Con sonido', soundOff: 'Sin sonido', other: 'English', exit: 'Salir',
    start: (d: string) => `Empieza en la entrada: ${d}.`, startLabel: 'Listo',
    guiding: (l: string) => `En ${l}`, uncertain: 'No sé dónde estás', off_route: 'Fuera de la ruta grabada',
    reorient: 'Comprueba hacia dónde miras', arrived: 'Destino confirmado',
    problem: 'No se pudo comprobar esa vista. Tu último paso confirmado sigue vigente.', evidence: 'Por qué',
    notApproved: 'Esta ruta aún no está aprobada. Pide al organizador que la revise y la apruebe.', again: 'Empezar de nuevo',
    speech: 'Voz del navegador',
    target: 'Referencia', side: 'Lado', left: 'izquierdo', right: 'derecho', floor: 'Piso', completion: 'Finalización',
    manual: 'Ya lo hice (manual)', active: 'Acción activa — comprueba la vista antes de continuar',
  },
} as const;

export function GuideScreen({ core, routeId, exitHref, mode: requestedMode, uploadFrame = realUploadFrame }: GuideScreenProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [confirmedId, setConfirmedId] = useState<Id | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [sound, setSound] = useState(false);
  const mounted = useRef(false);
  const started = useRef(false);
  const [mode, setMode] = useState<Mode>(requestedMode ?? 'mock');
  const inFlight = useRef(false);
  const lastSeq = useRef(0);
  const spoken = useRef<Id | null>(null);

  const locale: Locale = session?.locale ?? 'en';
  const t = T[locale];

  useEffect(() => {
    mounted.current = true;
    if (started.current) return () => { mounted.current = false; };
    started.current = true;
    const queryMode = new URLSearchParams(window.location.search).get('mode');
    const selected = requestedMode ?? (queryMode === 'live' || queryMode === 'replay' ? queryMode : 'mock');
    setMode(selected);
    (async () => {
      const s = await core.startSession(routeId, 'en', selected);
      if (!mounted.current) return;
      if (!s.ok) return setFatal({ ...s.error, message: `${T.en[selected]}: ${s.error.message}` });
      const r = await core.getRoute(routeId, s.value.routeVersion);
      if (!mounted.current) return;
      if (!r.ok) return setFatal(r.error);
      setSession(s.value); setRoute(r.value);
    })();
    return () => { mounted.current = false; };
  }, [core, routeId, requestedMode]);

  async function checkCamera(frame: () => Promise<Blob>) {
    if (!session || inFlight.current) return;
    setPending(true); setProblem(null);
    const result = await checkView({ core, sessionId: session.id, upload: uploadFrame, frame,
      capturedAt: new Date().toISOString(), flight: inFlight,
      isCurrent: () => mounted.current,
    });
    if (!mounted.current) return;
    setPending(false);
    if (!result) return;
    if (result.ok) accept(result.value);
    else setProblem(`${T[session.locale].problem} (${result.error.message})`);
  }

  // Speak only new instructions; cancel anything stale. Never blocks the UI.
  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (!sound || !guidance) { synth.cancel(); spoken.current = null; return; }
    if (spoken.current === guidance.instructionId) return;
    spoken.current = guidance.instructionId;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(guidance.text);
    u.lang = guidance.locale === 'es' ? 'es-ES' : 'en-US';
    synth.speak(u);
  }, [sound, guidance]);

  function accept(g: Guidance) {
    if (!mounted.current || g.sequence < lastSeq.current) return; // ignore stale responses
    lastSeq.current = g.sequence;
    setGuidance(g);
    if (g.state === 'guiding' || g.state === 'arrived') setConfirmedId(g.checkpointId);
  }

  async function observe(mediaId: Id) {
    if (!session || inFlight.current) return; // one match in flight; extra clicks are dropped
    inFlight.current = true; setPending(true); setProblem(null);
    try {
      const seq = await core.reserveFrameSequence(session.id);
      if (!mounted.current) return;
      if (!seq.ok) return setProblem(seq.error.message);
      const g = await core.matchFrame({
        sessionId: session.id, routeVersion: seq.value.routeVersion, sequence: seq.value.sequence,
        capturedAt: new Date().toISOString(), mediaId,
      });
      if (!mounted.current) return;
      if (g.ok) accept(g.value);
      else if (g.error.code !== 'STALE_FRAME') setProblem(`${T[session.locale].problem} (${g.error.message})`);
    } finally {
      inFlight.current = false; if (mounted.current) setPending(false);
    }
  }

  async function refreshGuide(sessionId: Id) {
    const g = await core.currentGuidance(sessionId);
    if (!mounted.current) return;
    const s = await core.getSession(sessionId);
    if (!mounted.current) return;
    if (!s.ok) return setProblem(s.error.message);
    const refreshed = reconcileGuide(s.value, g.ok ? g.value : null, lastSeq.current);
    if (!refreshed) return;
    setSession(s.value);
    setConfirmedId(refreshed.checkpointId);
    lastSeq.current = refreshed.sequence;
    setGuidance(refreshed.guidance);
    if (!g.ok) setProblem(g.error.message);
  }

  async function switchLocale() {
    if (!session || inFlight.current) return;
    inFlight.current = true; setPending(true);
    try {
      const r = await core.setLocale(session.id, session.locale === 'en' ? 'es' : 'en');
      if (!mounted.current) return;
      if (!r.ok) return setProblem(r.error.message);
      setSession(r.value);
      await refreshGuide(session.id);
    } finally {
      inFlight.current = false; if (mounted.current) setPending(false);
    }
  }

  async function completeAction() {
    if (!session || !confirmedId || inFlight.current) return;
    inFlight.current = true; setPending(true); setProblem(null);
    try {
      const seq = await core.reserveFrameSequence(session.id);
      if (!mounted.current) return;
      if (!seq.ok) return setProblem(seq.error.message);
      const g = await core.completeAction(session.id, { ...seq.value, checkpointId: confirmedId });
      if (!mounted.current) return;
      if (g.ok) {
        if (g.value.sequence >= lastSeq.current) setConfirmedId(g.value.checkpointId);
        accept(g.value);
      }
      else {
        if (g.error.code !== 'STALE_FRAME') setProblem(g.error.message);
        // A failed response does not mean the server rejected the manual advance.
        await refreshGuide(session.id);
      }
    } finally {
      inFlight.current = false; if (mounted.current) setPending(false);
    }
  }

  if (fatal)
    return (
      <main className="guide-page center-msg">
        <div style={{ display: 'grid', gap: '1rem', maxWidth: '40ch' }}>
          <p className="banner" role="alert">{fatal.code === 'NOT_APPROVED' ? T.en.notApproved : fatal.message}</p>
          <a className="ctl" href={exitHref}>{T.en.exit}</a>
        </div>
      </main>
    );
  if (!session || !route) return <main className="guide-page center-msg"><p>Starting guide…</p></main>;

  const cps = route.checkpoints;
  const doneIdx = cps.findIndex((c) => c.id === confirmedId);
  const arrived = guidance?.state === 'arrived';
  const cpLabel = (id: Id | null) => cps.find((c) => c.id === id)?.label ?? '';
  const state = guidance?.state ?? 'start';
  const active = cps.find((c) => c.id === confirmedId);
  const action = !arrived ? active?.action : undefined;
  const hasArrow = guidance?.state === 'guiding' && guidance.direction !== null;

  return (
    <main className="guide-page" lang={locale}>
      <div className="guide-layout">
        <section className="guide" aria-label={route.name}>
          <div className="guide-top">
            <Brand compact />
            <div className="controls">
              <button className="ctl" aria-pressed={sound} onClick={() => setSound((s) => !s)} title={t.speech}>
                {sound ? t.soundOn : t.soundOff}
              </button>
              <button className="ctl" disabled={pending} onClick={switchLocale} lang={locale === 'en' ? 'es' : 'en'}>{t.other}</button>
              <a className="ctl" href={exitHref}>{t.exit}</a>
            </div>
          </div>
          <Camera locale={locale} busy={pending} onCheck={mode === 'mock' ? undefined : checkCamera}>
            <p className="stage-label"><span className={`${styles.badge} ${styles[mode]}`}>{t[mode]}</span> {t.notes[mode]}</p>
          </Camera>

          <div>
            <ol className="crumbs" aria-label={route.name}>
              {cps.map((c, i) => {
                const s = i === doneIdx && action ? 'next' : i <= doneIdx ? (arrived && c.isDestination ? 'arrived' : 'done') : i === doneIdx + 1 ? 'next' : 'todo';
                return (
                  <li key={c.id}>
                    <span className="dot" data-s={s} title={c.label} />
                    <span className="sr-only">{c.label}: {s}</span>
                    {i < cps.length - 1 && <span className="link" data-s={i < doneIdx ? 'done' : 'todo'} aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
            <div className="crumb-labels" aria-hidden="true">
              <span>{cps[0].label}</span><span>{route.destinationLabel}</span>
            </div>
          </div>

          <div className="card" data-state={state} data-sequence={guidance?.sequence ?? 0} data-arrow={hasArrow ? 'shown' : 'none'} aria-live="polite" aria-busy={pending}>
            {guidance?.state === 'guiding' && guidance.direction ? (
              <Arrow direction={guidance.direction} label={DIRECTION_TEXT[locale][guidance.direction]} />
            ) : arrived ? (
              <div className="sign-empty" style={{ borderStyle: 'solid', borderColor: 'var(--green)', color: 'var(--green)' }} aria-hidden="true">✓</div>
            ) : guidance && guidance.state !== 'guiding' ? (
              <div className="sign-empty" aria-hidden="true">?</div>
            ) : !guidance ? (
              <div className="sign-empty" style={{ borderColor: 'var(--night-rule)', color: 'var(--on-night-muted)' }} aria-hidden="true">·</div>
            ) : null}
            <div>
              <p className="state">
                {!guidance ? t.startLabel
                  : guidance.state === 'guiding' ? t.guiding(cpLabel(guidance.checkpointId))
                  : t[guidance.state]}
              </p>
              <p className="say">{guidance?.state === 'guiding' && action ? active!.instruction[locale] : guidance ? guidance.text : t.start(route.startDescription)}</p>
              {action && <div className="action-details">
                {guidance?.state !== 'guiding' && <p><strong>{t.active}: {active!.label}</strong></p>}
                <p><strong>{t.target}:</strong> {action.target}</p>
                {action.side && <p><strong>{t.side}:</strong> {t[action.side]}</p>}
                {action.targetFloor && <p><strong>{t.floor}:</strong> {action.targetFloor}</p>}
                {action.steps.length > 0 && <ol>{action.steps.map((step, i) => <li key={i}>{step[locale]}</li>)}</ol>}
                <p><strong>{t.completion}:</strong> {action.completion[locale]}</p>
                <button className="ctl" disabled={pending} onClick={completeAction}>{t.manual}</button>
              </div>}
              {guidance && guidance.evidence.length > 0 && (
                <p className="evidence">{t.evidence}: {guidance.evidence.join('; ')}</p>
              )}
              {arrived && (
                <button className="ctl" style={{ marginTop: '.6rem' }} onClick={() => window.location.reload()}>{t.again}</button>
              )}
            </div>
          </div>
          {problem && <p className="banner" role="alert">{problem}</p>}
        </section>

        {mode === 'mock' && <MockPanel route={route} disabled={pending} lastSeq={lastSeq.current} onPick={observe} />}
      </div>
    </main>
  );
}

function MockPanel({ route, disabled, lastSeq, onPick }: {
  route: Route; disabled: boolean; lastSeq: number; onPick: (mediaId: Id) => void;
}) {
  const scenes = mockScenes(route);
  return (
    <aside className="mock-panel" aria-labelledby="mock-h" lang="en">
      <h2 id="mock-h">Mock observations</h2>
      <p>Fictional mock fixture. Pick a synthetic observation to exercise route rules. Success is not field or terrain-safety evidence.</p>
      {route.checkpoints.map((c, i) => (
        <fieldset key={c.id}>
          <legend>{i + 1}. {c.label}</legend>
          <div className="scene-grid">
            {scenes.filter((s) => s.mediaId.startsWith(`mock:${c.id}:`)).map((s) => (
              <button key={s.mediaId} className="scene" disabled={disabled} onClick={() => onPick(s.mediaId)}>{s.label}</button>
            ))}
            {route.id === actionFixture.route.id && actionFixture.observations.filter((s) => s.mediaId.startsWith(`mock:${c.id}:`)).map((s) => (
              <button key={s.mediaId} className="scene" disabled={disabled} onClick={() => onPick(s.mediaId)}>{s.label}</button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset>
        <legend>Other</legend>
        <div className="scene-grid">
          {scenes.filter((s) => s.group === 'other').map((s) => (
            <button key={s.mediaId} className="scene" disabled={disabled} onClick={() => onPick(s.mediaId)}>{s.label}</button>
          ))}
        </div>
      </fieldset>
      <p role="status">{disabled ? 'Checking…' : lastSeq ? `Last accepted frame: #${lastSeq}` : 'No frames yet.'}</p>
    </aside>
  );
}
