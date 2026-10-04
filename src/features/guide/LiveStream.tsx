'use client';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@contracts/contracts.ts';
import { Brand } from '@/ui/Brand.tsx';
import { httpCore } from '@/client/httpCore.ts';
import { LiveGuideSession, liveGuideEnabled, type LiveFailure, type LiveStatus } from '@/client/liveGuide.ts';
import styles from './mode.module.css';

const T = {
  en: {
    badge: 'LIVE · Gemini', note: 'Camera frames and, if you turn it on, your voice stream to Google Gemini while the guide runs.',
    start: 'Start live guide', stop: 'Stop', starting: 'Starting live guide…', reconnecting: 'Reconnecting…', stopped: 'Live guide stopped.',
    retry: 'Try again', exit: 'Exit', classic: 'Use check-view guide', other: 'Español',
    micOn: 'Turn mic on', micOff: 'Mute mic', micHint: 'Mic is off. Turn it on to talk to the guide.',
    listening: 'Mic on', speaking: 'Guide is speaking', quiet: 'Watching the camera', waiting: 'The guide will speak when you start walking.',
    preview: 'Camera preview', captions: 'Guide captions', loading: 'Loading route…',
    off: 'The live voice guide is not enabled on this server.', notApproved: "This route isn't approved yet. Ask the organizer to review and approve it.",
    f: {
      unavailable: 'The live voice guide is not available here. Use the check-view guide instead.',
      token: "Couldn't start the live guide. Check your connection, then try again.",
      camera_denied: 'Camera access was blocked. Allow the camera for this site in your browser settings, then try again.',
      camera_missing: 'No camera is available here. Phones need this page over HTTPS; on this computer use localhost.',
      camera_error: "The camera couldn't start. Close other apps using it, then try again.",
      socket: 'The live connection failed. Try again.',
      limit: 'The live connection ended and could not be restored. Press Start to begin again; your route is unchanged.',
      mic_denied: 'Microphone access was blocked. The guide still works from the camera.',
      mic_error: "The microphone couldn't start. The guide still works from the camera.",
    } as Record<LiveFailure, string>,
  },
  es: {
    badge: 'EN VIVO · Gemini', note: 'Los fotogramas de la cámara y, si lo activas, tu voz se envían a Google Gemini mientras la guía funciona.',
    start: 'Iniciar guía en vivo', stop: 'Detener', starting: 'Iniciando guía en vivo…', reconnecting: 'Reconectando…', stopped: 'Guía en vivo detenida.',
    retry: 'Reintentar', exit: 'Salir', classic: 'Usar la guía de comprobar vista', other: 'English',
    micOn: 'Activar micrófono', micOff: 'Silenciar micrófono', micHint: 'El micrófono está apagado. Actívalo para hablar con la guía.',
    listening: 'Micrófono activo', speaking: 'La guía está hablando', quiet: 'Observando la cámara', waiting: 'La guía hablará cuando empieces a caminar.',
    preview: 'Vista previa de la cámara', captions: 'Subtítulos de la guía', loading: 'Cargando ruta…',
    off: 'La guía de voz en vivo no está activada en este servidor.', notApproved: 'Esta ruta aún no está aprobada. Pide al organizador que la revise y la apruebe.',
    f: {
      unavailable: 'La guía de voz en vivo no está disponible aquí. Usa la guía de comprobar vista.',
      token: 'No se pudo iniciar la guía en vivo. Revisa tu conexión y vuelve a intentarlo.',
      camera_denied: 'Se bloqueó el acceso a la cámara. Permite la cámara para este sitio en la configuración del navegador y vuelve a intentarlo.',
      camera_missing: 'No hay cámara disponible. En un teléfono esta página necesita HTTPS; en este ordenador usa localhost.',
      camera_error: 'No se pudo iniciar la cámara. Cierra otras apps que la usen y vuelve a intentarlo.',
      socket: 'Falló la conexión en vivo. Vuelve a intentarlo.',
      limit: 'La conexión en vivo terminó y no se pudo restablecer. Pulsa Iniciar para empezar de nuevo; tu ruta no cambia.',
      mic_denied: 'Se bloqueó el micrófono. La guía sigue funcionando con la cámara.',
      mic_error: 'No se pudo iniciar el micrófono. La guía sigue funcionando con la cámara.',
    } as Record<LiveFailure, string>,
  },
} as const;

export function LiveStream({ routeId, exitHref }: { routeId: string; exitHref: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const session = useRef<LiveGuideSession | null>(null);
  const mounted = useRef(true);
  const [locale, setLocale] = useState<Locale>('en');
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [failure, setFailure] = useState<{ kind: LiveFailure; detail?: string } | null>(null);
  const [captions, setCaptions] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [mic, setMic] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<'off' | 'notApproved' | 'missing' | null>(null);
  const t = T[locale];

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      const [enabled, route] = await Promise.all([liveGuideEnabled(), httpCore.getRoute(routeId)]);
      if (!mounted.current) return;
      if (!route.ok) return setBlocked('missing');
      setName(route.value.name);
      setBlocked(route.value.status !== 'approved' ? 'notApproved' : enabled ? null : 'off');
    })();
    return () => { mounted.current = false; session.current?.stop(); session.current = null; };
  }, [routeId]);

  const active = status === 'starting' || status === 'live' || status === 'reconnecting';

  function start() {
    if (!video.current || active) return;
    session.current?.stop();
    setFailure(null); setCaptions([]); setMic(false); setSpeaking(false);
    const s = new LiveGuideSession({
      routeId, locale, video: video.current,
      handlers: {
        onStatus: (v) => { if (mounted.current && session.current === s) setStatus(v); },
        onFailure: (kind, detail) => { if (mounted.current && session.current === s) setFailure({ kind, detail }); },
        onCaptions: (lines) => { if (mounted.current && session.current === s) setCaptions(lines); },
        onSpeaking: (on) => { if (mounted.current && session.current === s) setSpeaking(on); },
      },
    });
    session.current = s;
    void s.start(); // AudioContext is created synchronously inside this click
  }
  function stop() { session.current?.stop(); session.current = null; setMic(false); setSpeaking(false); }
  async function toggleMic() {
    const s = session.current; if (!s) return;
    await s.setMic(!s.micEnabled);
    if (mounted.current) setMic(s.micEnabled);
  }

  const failureText = failure ? (t.f[failure.kind]) : null;
  const blockedText = blocked === 'off' ? t.off : blocked === 'notApproved' ? t.notApproved : blocked === 'missing' ? T.en.f.token : null;
  const statusText = status === 'starting' ? t.starting : status === 'reconnecting' ? t.reconnecting : status === 'live' ? (speaking ? t.speaking : mic ? t.listening : t.quiet) : status === 'stopped' ? t.stopped : '';

  return (
    <main className="guide-page" lang={locale}>
      <div className="guide-layout">
        <section className="guide" aria-label={name ?? t.loading}>
          <div className="guide-top">
            <Brand compact />
            <div className="controls">
              <button className="ctl" disabled={active} onClick={() => setLocale((l) => (l === 'en' ? 'es' : 'en'))} lang={locale === 'en' ? 'es' : 'en'}>{t.other}</button>
              <a className="ctl" href={`/follow/${encodeURIComponent(routeId)}`}>{t.classic}</a>
              <a className="ctl" href={exitHref}>{t.exit}</a>
            </div>
          </div>
          <div className="stage">
            <video ref={video} playsInline muted hidden={!active} aria-label={t.preview} />
            {!active && (
              <div className="placeholder">
                <p style={{ margin: 0 }}>{blockedText ?? name ?? t.loading}</p>
                <p style={{ margin: 0 }}>{t.note}</p>
                <button className="ctl" disabled={blocked !== null || name === null} onClick={start}>{failure || status === 'stopped' ? t.retry : t.start}</button>
              </div>
            )}
            {active && (
              <p className="stage-label">
                <span className={`${styles.badge} ${styles.live}`} aria-label="Live, Gemini">{t.badge}</span>
                <span className={`${styles.dot} ${status === 'live' ? styles.dotOn : ''}`} aria-hidden="true" />
              </p>
            )}
            {active && <button className="ctl cam-stop" onClick={stop}>{t.stop}</button>}
          </div>

          <div className={styles.liveBar}>
            <button className="ctl" aria-pressed={mic} disabled={status !== 'live'} onClick={toggleMic}>{mic ? t.micOff : t.micOn}</button>
            <p role="status" style={{ margin: 0 }}>{statusText}{active && !mic && status === 'live' ? ` · ${t.micHint}` : ''}</p>
          </div>

          <div className="card" data-state={status === 'live' ? 'guiding' : 'start'}>
            <div />
            <ul className={styles.captions} aria-live="polite" aria-label={t.captions}>
              {captions.length ? captions.map((line, i) => <li key={i}>{line.trim()}</li>) : <li>{active ? t.waiting : ''}</li>}
            </ul>
          </div>
          {failureText && <p className="banner" role="alert">{failureText}{failure?.detail && failure.kind === 'token' ? ` (${failure.detail})` : ''}</p>}
        </section>
      </div>
    </main>
  );
}
