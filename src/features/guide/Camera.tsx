'use client';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@contracts/contracts.ts';

type CamState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable' | 'error';

const T = {
  en: {
    start: 'Start camera', stop: 'Stop camera', retry: 'Try again', starting: 'Starting camera…',
    off: 'Camera off',
    denied: 'Camera access was blocked. Allow the camera for this site in your browser settings (usually the icon beside the address), then try again.',
    unavailable: 'No camera is available here. Phones need this page over HTTPS; on this computer use localhost.',
    error: "The camera couldn't start. Close other apps using it, then try again.",
  },
  es: {
    start: 'Activar cámara', stop: 'Detener cámara', retry: 'Reintentar', starting: 'Iniciando cámara…',
    off: 'Cámara apagada',
    denied: 'Se bloqueó el acceso a la cámara. Permite la cámara para este sitio en la configuración del navegador (normalmente el icono junto a la dirección) y vuelve a intentarlo.',
    unavailable: 'No hay cámara disponible. En un teléfono esta página necesita HTTPS; en este ordenador usa localhost.',
    error: 'No se pudo iniciar la cámara. Cierra otras apps que la usen y vuelve a intentarlo.',
  },
};

export function Camera({ locale, children }: { locale: Locale; children?: React.ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CamState>('off');
  const t = T[locale];

  function stop() {
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setState('off');
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) return setState('unavailable');
    setState('starting');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setState('on');
    } catch (e) {
      const name = (e as DOMException)?.name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'unavailable' : 'error');
    }
  }

  useEffect(() => () => stream.current?.getTracks().forEach((tr) => tr.stop()), []);

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
      {state === 'on' && <button className="ctl cam-stop" onClick={stop}>{t.stop}</button>}
      {children}
    </div>
  );
}
