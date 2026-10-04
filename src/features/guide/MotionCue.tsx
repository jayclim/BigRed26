import type { CSSProperties } from 'react';
import type { Direction, Locale } from '@contracts/contracts.ts';
import { DIRECTION_TEXT } from '@/ui/Arrow.tsx';
import styles from './guide.module.css';

const STILL = { en: 'No direction shown', es: 'No se muestra ninguna dirección' } as const;
/** Static opacity by distance from the head dot; used when motion is reduced. */
const GRADE = [1, .7, .45, .28, .16];

/**
 * Five dots that pulse in sequence toward `direction`. The caller passes a direction only while
 * guiding with a confirmed approach. Without one, the dots stay still: amber (`wait`), grey (`idle`) or dim cyan.
 */
export function MotionCue({ direction, tone, locale, reduced }: {
  direction: Direction | null; tone: 'go' | 'wait' | 'idle'; locale: Locale; reduced: boolean;
}) {
  const column = direction === 'forward' || direction === 'up' || direction === 'down';
  const head = direction === 'right' || direction === 'down' ? 4 : 0;
  return (
    <div className={styles.cue} data-flow={direction ? 'on' : 'off'} data-tone={tone} data-axis={column ? 'col' : 'row'}
      data-reduced={reduced || undefined} role="img" aria-label={direction ? DIRECTION_TEXT[locale][direction] : STILL[locale]}>
      {GRADE.map((_, i) => {
        const d = Math.abs(i - head);
        const style = direction ? { animationDelay: `${((4 - d) * .16).toFixed(2)}s`, '--o': GRADE[d] } as CSSProperties : undefined;
        return <span key={i} className={styles.cueDot} style={style} />;
      })}
    </div>
  );
}
