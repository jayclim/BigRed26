'use client';
import { useEffect, useRef, useState } from 'react';
import type { CoreAdapter, Guidance, Id, Locale, Route, Session } from '@contracts/contracts.ts';
import { Arrow, DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import { mockScenes } from '@/shared/mockScenes.ts';
import { Brand } from '@/ui/Brand.tsx';
import { Camera } from './Camera.tsx';

export interface GuideScreenProps {
  core: CoreAdapter;
  routeId: Id;
  /** Where Exit goes, e.g. the creator page */
  exitHref: string;
}

const T = {
  en: {
    mock: 'Mock', camNote: 'Camera not analyzed',
    soundOn: 'Sound on', soundOff: 'Sound off', other: 'Español', exit: 'Exit',
    start: (d: string) => `Start at the entrance: ${d}.`, startLabel: 'Ready',
    guiding: (l: string) => `At ${l}`, uncertain: 'Not sure where you are', off_route: 'Off the recorded route',
    reorient: "Check which way you're facing", arrived: 'Destination confirmed',
    problem: "Couldn't check that view. Your last confirmed step still stands.", evidence: 'Why',
    notApproved: "This route isn't approved yet. Ask the organizer to review and approve it.", again: 'Start a new walk',
    speech: 'Browser speech',
  },
  es: {
    mock: 'Simulado', camNote: 'La cámara no se analiza',
    soundOn: 'Con sonido', soundOff: 'Sin sonido', other: 'English', exit: 'Salir',
    start: (d: string) => `Empieza en la entrada: ${d}.`, startLabel: 'Listo',
    guiding: (l: string) => `En ${l}`, uncertain: 'No sé dónde estás', off_route: 'Fuera de la ruta grabada',
    reorient: 'Comprueba hacia dónde miras', arrived: 'Destino confirmado',
    problem: 'No se pudo comprobar esa vista. Tu último paso confirmado sigue vigente.', evidence: 'Por qué',
    notApproved: 'Esta ruta aún no está aprobada. Pide al organizador que la revise y la apruebe.', again: 'Empezar de nuevo',
    speech: 'Voz del navegador',
  },
} as const;

export function GuideScreen({ core, routeId, exitHref }: GuideScreenProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [confirmedId, setConfirmedId] = useState<Id | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [sound, setSound] = useState(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  const lastSeq = useRef(0);
  const spoken = useRef<Id | null>(null);

  const locale: Locale = session?.locale ?? 'en';
  const t = T[locale];

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const s = await core.startSession(routeId, 'en', 'mock'); // mock chosen explicitly; no live fallback exists
      if (!s.ok) return setFatal(s.error);
      const r = await core.getRoute(routeId, s.value.routeVersion);
      if (!r.ok) return setFatal(r.error);
      setSession(s.value); setRoute(r.value);
    })();
  }, [core, routeId]);

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
    if (g.sequence < lastSeq.current) return; // ignore stale responses
    lastSeq.current = g.sequence;
    setGuidance(g);
    if (g.state === 'guiding' || g.state === 'arrived') setConfirmedId(g.checkpointId);
  }

  async function observe(mediaId: Id) {
    if (!session || inFlight.current) return; // one match in flight; extra clicks are dropped
    inFlight.current = true; setPending(true); setProblem(null);
    try {
      const seq = await core.reserveFrameSequence(session.id);
      if (!seq.ok) return setProblem(seq.error.message);
      const g = await core.matchFrame({
        sessionId: session.id, routeVersion: seq.value.routeVersion, sequence: seq.value.sequence,
        capturedAt: new Date().toISOString(), mediaId,
      });
      if (g.ok) accept(g.value);
      else if (g.error.code !== 'STALE_FRAME') setProblem(`${T[session.locale].problem} (${g.error.message})`);
    } finally {
      inFlight.current = false; setPending(false);
    }
  }

  async function switchLocale() {
    if (!session) return;
    const r = await core.setLocale(session.id, session.locale === 'en' ? 'es' : 'en');
    if (!r.ok) return setProblem(r.error.message);
    setSession(r.value);
    const g = await core.currentGuidance(session.id);
    if (g.ok && g.value) accept(g.value);
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
              <button className="ctl" onClick={switchLocale} lang={locale === 'en' ? 'es' : 'en'}>{t.other}</button>
              <a className="ctl" href={exitHref}>{t.exit}</a>
            </div>
          </div>
          <Camera locale={locale}>
            <p className="stage-label"><span className="mock-badge">{t.mock}</span> {t.camNote}</p>
          </Camera>

          <div>
            <ol className="crumbs" aria-label={route.name}>
              {cps.map((c, i) => {
                const s = i <= doneIdx ? (arrived && c.isDestination ? 'arrived' : 'done') : i === doneIdx + 1 ? 'next' : 'todo';
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

          <div className="card" data-state={state} aria-live="polite" aria-busy={pending}>
            {guidance?.state === 'guiding' ? (
              <Arrow direction={guidance.direction} label={DIRECTION_TEXT[locale][guidance.direction]} />
            ) : arrived ? (
              <div className="sign-empty" style={{ borderStyle: 'solid', borderColor: 'var(--green)', color: 'var(--green)' }} aria-hidden="true">✓</div>
            ) : guidance ? (
              <div className="sign-empty" aria-hidden="true">?</div>
            ) : (
              <div className="sign-empty" style={{ borderColor: 'var(--night-rule)', color: 'var(--on-night-muted)' }} aria-hidden="true">·</div>
            )}
            <div>
              <p className="state">
                {!guidance ? t.startLabel
                  : guidance.state === 'guiding' ? t.guiding(cpLabel(guidance.checkpointId))
                  : t[guidance.state]}
              </p>
              <p className="say">{guidance ? guidance.text : t.start(route.startDescription)}</p>
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

        <MockPanel route={route} disabled={pending} lastSeq={lastSeq.current} onPick={observe} />
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
      <p>Fictional sample building. Pick what the camera would see; each pick runs through the real route rules.</p>
      {route.checkpoints.map((c, i) => (
        <fieldset key={c.id}>
          <legend>{i + 1}. {c.label}</legend>
          <div className="scene-grid">
            {scenes.filter((s) => s.mediaId.startsWith(`mock:${c.id}:`)).map((s) => (
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
