'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CoreAdapter, Guidance, Id, Locale, Mode, Route, Session, VoiceAdapter } from '@contracts/contracts.ts';
import { Arrow, DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import { mockScenes } from '@/shared/mockScenes.ts';
import actionFixture from '@contracts/fixture.actions.v1.json';
import { Brand } from '@/ui/Brand.tsx';
import { MotionCue } from '@/ui/MotionCue.tsx';
import { Camera } from './Camera.tsx';
import { uploadFrame as realUploadFrame } from '@/client/frameUpload.ts';
import { checkView } from './checkView.ts';
import styles from './mode.module.css';
import { reconcileGuide } from './reconcileGuide.ts';
import { createVoicePlayer, type VoiceStatus } from './voicePlayback.ts';

export interface GuideScreenProps {
  core: CoreAdapter;
  voice?: VoiceAdapter;
  /** Read once at mount. Remount the screen to change mode. */
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
    speech: 'Browser speech', generatedVoice: 'Generated voice',
    voiceUnavailable: 'Voice unavailable. Captions still shown.',
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
    speech: 'Voz del navegador', generatedVoice: 'Voz generada',
    voiceUnavailable: 'Voz no disponible. Los subtítulos siguen visibles.',
    target: 'Referencia', side: 'Lado', left: 'izquierdo', right: 'derecho', floor: 'Piso', completion: 'Finalización',
    manual: 'Ya lo hice (manual)', active: 'Acción activa — comprueba la vista antes de continuar',
  },
} as const;

export function GuideScreen({ core, routeId, exitHref, mode: requestedMode, uploadFrame = realUploadFrame, voice }: GuideScreenProps) {
  const reduceMotion = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [confirmedId, setConfirmedId] = useState<Id | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [sound, setSound] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(null);
  const voicePlayer = useRef<ReturnType<typeof createVoicePlayer> | null>(null);
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

  useEffect(() => {
    setVoiceStatus(null);
    const player = createVoicePlayer({ createAudio: (url) => new Audio(url), onStatus: setVoiceStatus });
    voicePlayer.current = player;
    return () => {
      player.dispose(); voicePlayer.current = null;
      window.speechSynthesis?.cancel(); spoken.current = null;
    };
  }, []);

  // Speak only new instructions; cancel anything stale. Never blocks the UI.
  useEffect(() => {
    if (voice) {
      window.speechSynthesis?.cancel(); spoken.current = null;
      if (!sound || !guidance || guidance.locale !== locale) voicePlayer.current?.stop();
      else void voicePlayer.current?.speak(voice, guidance);
      return;
    }
    voicePlayer.current?.stop();
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (!sound || !guidance) { synth.cancel(); spoken.current = null; return; }
    if (spoken.current === guidance.instructionId) return;
    spoken.current = guidance.instructionId;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(guidance.text);
    u.lang = guidance.locale === 'es' ? 'es-ES' : 'en-US';
    synth.speak(u);
  }, [sound, guidance, voice, locale]);

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
  const stateText = !guidance ? t.startLabel : guidance.state === 'guiding' ? t.guiding(cpLabel(guidance.checkpointId)) : t[guidance.state];
  const instructionText = guidance?.state === 'guiding' && action ? active!.instruction[locale] : guidance ? guidance.text : t.start(route.startDescription);
  const textMotion = {
    initial: reduceMotion ? false as const : { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12, ease: 'easeIn' as const } },
    transition: { duration: reduceMotion ? 0 : 0.16 },
  };

  return (
    <main className="guide-page" lang={locale}>
      <div className="guide-layout">
        <section className="guide" aria-label={route.name}>
          {guidance?.state === 'guiding' && guidance.direction && <MotionCue key={guidance.direction} direction={guidance.direction} still={!!reduceMotion} />}
          <div className="guide-top">
            <Brand compact />
            <div className="controls">
              <button className="ctl" aria-pressed={sound} aria-describedby="speech-source" onClick={() => setSound((s) => !s)}>
                {sound ? t.soundOn : t.soundOff}
              </button>
              <button className="ctl" disabled={pending} onClick={switchLocale} lang={locale === 'en' ? 'es' : 'en'}>{t.other}</button>
              <a className="ctl" href={exitHref}>{t.exit}</a>
            </div>
          </div>
          <p id="speech-source" className={styles.speechSource}>{voice ? t.generatedVoice : t.speech}</p>
          {voiceStatus && <p className={styles.voiceStatus} role="status">{t.voiceUnavailable}</p>}
          <Camera locale={locale} busy={pending} onCheck={mode === 'live' ? checkCamera : undefined}>
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
              <AnimatePresence initial={false} mode="wait">
                <motion.p key={stateText} className="state" {...textMotion}>{stateText}</motion.p>
              </AnimatePresence>
              <AnimatePresence initial={false} mode="wait">
                <motion.p key={`${state}:${instructionText}`} className="say" {...textMotion}>{instructionText}</motion.p>
              </AnimatePresence>
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
