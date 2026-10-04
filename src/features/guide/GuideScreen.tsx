'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CoreAdapter, Guidance, Id, Locale, Route, Session, VoiceAdapter } from '@contracts/contracts.ts';
import { Brand } from '@/ui/Brand.tsx';
import { LookToggle } from '@/ui/LookToggle.tsx';
import { Camera } from './Camera.tsx';
import { uploadFrame as realUploadFrame } from '@/client/frameUpload.ts';
import { liveGuideEnabled } from '@/client/liveProbe.ts';
import { checkView } from './checkView.ts';
import styles from './mode.module.css';
import g from './guide.module.css';
import { MotionCue } from './MotionCue.tsx';
import { RouteMap } from './RouteMap.tsx';
import { floorLabel, floorOf } from './routeMap.ts';
import { reconcileGuide } from './reconcileGuide.ts';
import { createVoicePlayer, type VoiceStatus } from './voicePlayback.ts';

export interface GuideScreenProps {
  core: CoreAdapter;
  voice?: VoiceAdapter;
  uploadFrame?: typeof realUploadFrame;
  routeId: Id;
  /** Where Exit goes, e.g. the creator page */
  exitHref: string;
}

const T = {
  en: {
    live: 'Live', note: 'Frames you check are sent to the server for recognition',
    soundOn: 'Sound on', soundOff: 'Sound off', other: 'Español', exit: 'Exit', liveVoice: 'Use live voice guide',
    start: (d: string) => `Start at the entrance: ${d}.`, startLabel: 'Ready',
    guiding: (l: string) => `At ${l}`, uncertain: 'Not sure where you are', off_route: 'Off the recorded route',
    reorient: "Check which way you're facing", arrived: 'Destination confirmed',
    problem: "Couldn't check that view. Your last confirmed step still stands.", evidence: 'Why',
    notApproved: "This route isn't approved yet. Ask the organizer to review and approve it.", again: 'Start a new walk',
    speech: 'Browser speech', generatedVoice: 'Generated voice',
    voiceUnavailable: 'Voice unavailable. Captions still shown.',
    target: 'Target', side: 'Side', left: 'left', right: 'right', floor: 'Floor', completion: 'Completion',
    manual: "I've done this (manual)", active: 'Active action — check your view before continuing', thisStep: 'This step',
  },
  es: {
    live: 'En vivo', note: 'Las vistas que compruebas se envían al servidor para su reconocimiento',
    soundOn: 'Con sonido', soundOff: 'Sin sonido', other: 'English', exit: 'Salir', liveVoice: 'Usar guía de voz en vivo',
    start: (d: string) => `Empieza en la entrada: ${d}.`, startLabel: 'Listo',
    guiding: (l: string) => `En ${l}`, uncertain: 'No sé dónde estás', off_route: 'Fuera de la ruta grabada',
    reorient: 'Comprueba hacia dónde miras', arrived: 'Destino confirmado',
    problem: 'No se pudo comprobar esa vista. Tu último paso confirmado sigue vigente.', evidence: 'Por qué',
    notApproved: 'Esta ruta aún no está aprobada. Pide al organizador que la revise y la apruebe.', again: 'Empezar de nuevo',
    speech: 'Voz del navegador', generatedVoice: 'Voz generada',
    voiceUnavailable: 'Voz no disponible. Los subtítulos siguen visibles.',
    target: 'Referencia', side: 'Lado', left: 'izquierdo', right: 'derecho', floor: 'Piso', completion: 'Finalización',
    manual: 'Ya lo hice (manual)', active: 'Acción activa — comprueba la vista antes de continuar', thisStep: 'Este paso',
  },
} as const;

export function GuideScreen({ core, routeId, exitHref, uploadFrame = realUploadFrame, voice }: GuideScreenProps) {
  const reduceMotion = useReducedMotion();
  const [session, setSession] = useState<Session | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [guidance, setGuidance] = useState<Guidance | null>(null);
  const [confirmedId, setConfirmedId] = useState<Id | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [sound, setSound] = useState(false);
  const [liveAvailable, setLiveAvailable] = useState(false); // shown only when the server reports the live guide enabled
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(null);
  const voicePlayer = useRef<ReturnType<typeof createVoicePlayer> | null>(null);
  const mounted = useRef(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  const lastSeq = useRef(0);
  const spoken = useRef<Id | null>(null);

  const locale: Locale = session?.locale ?? 'en';
  const t = T[locale];

  useEffect(() => {
    let current = true;
    void liveGuideEnabled().then((enabled) => { if (current) setLiveAvailable(enabled); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (started.current) return () => { mounted.current = false; };
    started.current = true;
    (async () => {
      const s = await core.startSession(routeId, 'en', 'live');
      if (!mounted.current) return;
      if (!s.ok) return setFatal({ ...s.error, message: `${T.en.live}: ${s.error.message}` });
      const r = await core.getRoute(routeId, s.value.routeVersion);
      if (!mounted.current) return;
      if (!r.ok) return setFatal(r.error);
      setSession(s.value); setRoute(r.value);
    })();
    return () => { mounted.current = false; };
  }, [core, routeId]);

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
  const cueDirection = guidance?.state === 'guiding' ? guidance.direction : null; // non-null exactly when hasArrow
  const tone = !guidance ? 'idle' : guidance.state === 'guiding' ? 'go' : guidance.state === 'arrived' ? 'done' : 'wait';
  const floor = guidance?.state === 'guiding' && active && !active.isDestination ? floorOf(active) : null;
  const floorText = floor && floorLabel(floor, locale);
  const statuses = cps.map((c, i) => i === doneIdx && action ? 'next' : i <= doneIdx ? (arrived && c.isDestination ? 'arrived' : 'done') : i === doneIdx + 1 ? 'next' : 'todo');
  const stateText = !guidance ? t.startLabel : guidance.state === 'guiding' ? t.guiding(cpLabel(guidance.checkpointId)) : t[guidance.state];
  const instructionText = guidance?.state === 'guiding' && action ? active!.instruction[locale] : guidance ? guidance.text : t.start(route.startDescription);
  const textMotion = {
    initial: reduceMotion ? false as const : { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12, ease: 'easeIn' as const } },
    transition: { duration: reduceMotion ? 0 : 0.16 },
  };

  return (
    <main className={`guide-page ${g.page}`} lang={locale}>
      <div className="guide-layout">
        <section className="guide" aria-label={route.name}>
          <div className="guide-top">
            <div className={g.brandRow}><Brand compact /><span className={g.routeName}>{route.name}</span></div>
            <div className="controls">
              <button className="ctl" aria-pressed={sound} aria-describedby="speech-source" onClick={() => setSound((s) => !s)}>
                {sound ? t.soundOn : t.soundOff}
              </button>
              <button className="ctl" disabled={pending} onClick={switchLocale} lang={locale === 'en' ? 'es' : 'en'}>{t.other}</button>
              {liveAvailable && <a className="ctl" href={`/follow/${encodeURIComponent(routeId)}`}>{t.liveVoice}</a>}
              <LookToggle className="ctl" />
              <a className="ctl" href={exitHref}>{t.exit}</a>
            </div>
          </div>
          <p id="speech-source" className={styles.speechSource}>{voice ? t.generatedVoice : t.speech}</p>
          {voiceStatus && <p className={styles.voiceStatus} role="status">{t.voiceUnavailable}</p>}

          <div className={g.cols}>
            <div className={g.col}>
              <Camera locale={locale} busy={pending} onCheck={checkCamera}>
                <p className="stage-label"><span className={`${styles.badge} ${styles.live}`}>{t.live}</span> {t.note}</p>
              </Camera>

              <div className={`state-glow ${g.glow}`} data-tone={tone}>
                <div className="card" data-state={state} data-sequence={guidance?.sequence ?? 0} data-arrow={hasArrow ? 'shown' : 'none'} aria-live="polite" aria-busy={pending}>
                  {arrived ? (
                    <div className={g.done} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </div>
                  ) : (
                    <MotionCue direction={cueDirection} tone={tone === 'done' ? 'go' : tone} locale={locale} reduced={!!reduceMotion} />
                  )}
                  <div className={g.body}>
                    <div className={g.stateRow}>
                      <AnimatePresence initial={false} mode="wait">
                        <motion.p key={stateText} className="state" {...textMotion}>{stateText}</motion.p>
                      </AnimatePresence>
                      {floorText && <span className={g.floorTag}><span aria-hidden="true">{floorText.glyph}</span> {floorText.text}</span>}
                    </div>
                    <AnimatePresence initial={false} mode="wait">
                      <motion.p key={`${state}:${instructionText}`} className="say" {...textMotion}>{instructionText}</motion.p>
                    </AnimatePresence>
                    {guidance && guidance.evidence.length > 0 && (
                      <p className="evidence">{t.evidence}: {guidance.evidence.join('; ')}</p>
                    )}
                    {arrived && (
                      <button className="ctl" style={{ marginTop: '.6rem' }} onClick={() => window.location.reload()}>{t.again}</button>
                    )}
                  </div>
                </div>
              </div>
              {problem && <p className="banner" role="alert">{problem}</p>}
            </div>

            <div className={g.col}>
              {action && <section className={`action-details ${g.stepCard}`} aria-labelledby="this-step-h" aria-live="polite">
                <h2 id="this-step-h">{t.thisStep}</h2>
                {guidance?.state !== 'guiding' && <p><strong>{t.active}: {active!.label}</strong></p>}
                <p><strong>{t.target}:</strong> {action.target}</p>
                {action.side && <p><strong>{t.side}:</strong> {t[action.side]}</p>}
                {action.targetFloor && <p><strong>{t.floor}:</strong> {action.targetFloor}</p>}
                {action.steps.length > 0 && <ol>{action.steps.map((step, i) => <li key={i}>{step[locale]}</li>)}</ol>}
                <p><strong>{t.completion}:</strong> {action.completion[locale]}</p>
                <button className="ctl" disabled={pending} onClick={completeAction}>{t.manual}</button>
              </section>}
              <RouteMap checkpoints={cps} statuses={statuses} current={doneIdx} guiding={guidance?.state === 'guiding'}
                flow={hasArrow} reduced={!!reduceMotion} locale={locale} name={route.name} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
