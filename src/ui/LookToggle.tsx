'use client';
import { useEffect, useState } from 'react';

const KEY = 'breadcrumb-look';

/** Switches between the classic look and the clay look. The choice is per browser; layout and behavior do not change. */
export function LookToggle({ className }: { className?: string }) {
  const [clay, setClay] = useState(false);
  useEffect(() => { setClay(document.documentElement.dataset.look === 'clay'); }, []);
  const toggle = () => {
    const next = !clay;
    setClay(next);
    if (next) document.documentElement.dataset.look = 'clay';
    else delete document.documentElement.dataset.look;
    try { localStorage.setItem(KEY, next ? 'clay' : 'classic'); } catch {}
  };
  return <button type="button" className={className} aria-pressed={clay} onClick={toggle}>Clay</button>;
}

/** Runs before paint so a saved clay choice does not flash the classic look. */
export const lookScript = `try{if(localStorage.getItem('${KEY}')==='clay')document.documentElement.dataset.look='clay'}catch(e){}`;
