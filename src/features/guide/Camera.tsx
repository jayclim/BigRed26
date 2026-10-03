'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './mode.module.css';
import { captureFrame } from './frameCapture.ts';
import type { Locale } from '@contracts/contracts.ts';

type CamState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable' | 'error';

const T = {
  en: {
    start: 'Start camera', stop: 'Stop camera', retry: 'Try again', starting: 'Starting camera…',
    off: 'Camera off', check: 'Check this view',
    denied: 'Camera access was blocked. Allow the camera for this site in your browser settings (usually the icon beside the address), then try again.',
    unavailable: 'No camera is available here. Phones need this page over HTTPS; on this computer use localhost.',
    error: "The camera couldn't start. Close other apps using it, then try again.",
  },
  es: {
    start: 'Activar cámara', stop: 'Detener cámara', retry: 'Reintentar', starting: 'Iniciando cámara…',
    off: 'Cámara apagada', check: 'Comprobar esta vista',
    denied: 'Se bloqueó el acceso a la cámara. Permite la cámara para este sitio en la configuración del navegador (normalmente el icono junto a la dirección) y vuelve a intentarlo.',
    unavailable: 'No hay cámara disponible. En un teléfono esta página necesita HTTPS; en este ordenador usa localhost.',
    error: 'No se pudo iniciar la cámara. Cierra otras apps que la usen y vuelve a intentarlo.',
  },
};

export function Camera({ locale, children, onCheck, busy = false }: {
  locale: Locale; children?: React.ReactNode;
  onCheck?: (capture: () => Promise<Blob>) => Promise<void>; busy?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('off');
  const t = T[locale];
  const generation = useRef(0);
  const capturing = useRef(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  function stop() {
    generation.current++;
    setCaptureError(null);
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setState('off');
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable');
    const token = ++generation.current;
    setState('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (token !== generation.current) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      if (token === generation.current) setState('on');
    } catch (e) {
      if (token !== generation.current) return;
      const name = (e as DOMException)?.name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'error');
    }
  }

  useEffect(() => () => {
    generation.current++;
    stream.current?.getTracks().forEach((tr) => tr.stop());
  }, []);

  async function check() {
    if (!onCheck || busy || capturing.current || !video.current || state !== 'on') return;
    capturing.current = true;
    const token = generation.current;
    setCaptureError(null);
    const capture = () => captureFrame(video.current!);
    try {
      await onCheck(capture);
    } catch (error) {
      if (token === generation.current) setCaptureError((error as Error).message);
    } finally { capturing.current = false; }
  }

  const failed = state === 'denied' || state === 'unavailable' || state === 'error';
  return (
    <div className="stage">
      <video ref={video} playsInline muted hidden={state !== 'on'} aria-label="Camera preview" />
      {state !== 'on' && (
        <div className="placeholder" role={failed ? 'alert' : undefined}>
          <p style={{ margin: 0 }}>{state === 'starting' ? t.starting : failed ? t[state] : t.off}</p>
          {state !== 'starting' && <button className="ctl" onClick={start}>{failed ? t.retry : t.start}</button>}
        </div>
      )}
      {state === 'on' && onCheck && <button className={`ctl ${styles.check}`} disabled={busy} onClick={check}>{t.check}</button>}
      {captureError && <p className="banner" role="alert">{captureError}</p>}
      {state === 'on' && <button className="ctl cam-stop" onClick={stop}>{t.stop}</button>}
      {children}
    </div>
  );
}
