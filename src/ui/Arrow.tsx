import type { Direction } from '@contracts/contracts.ts';

const ROTATE: Record<Direction, number> = { forward: 0, up: 0, right: 90, down: 180, left: -90 };

/** Large direction sign. `up`/`down` (stairs/floors) add a bar so they read differently from `forward`. */
export function Arrow({ direction, label }: { direction: Direction; label: string }) {
  const floor = direction === 'up' || direction === 'down';
  return (
    <div className="sign" role="img" aria-label={label}>
      <svg viewBox="0 0 64 64" style={{ transform: `rotate(${ROTATE[direction]}deg)` }} aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="var(--cyan)" />
        <path d="M32 13 L49 32 H38 V51 H26 V32 H15 Z" fill="var(--night)" />
        {floor && <rect x="18" y="8" width="28" height="4" rx="2" fill="var(--night)" />}
      </svg>
    </div>
  );
}

export const DIRECTION_TEXT: Record<'en' | 'es', Record<Direction, string>> = {
  en: { forward: 'Straight ahead', left: 'Turn left', right: 'Turn right', up: 'Go up a floor', down: 'Go down a floor' },
  es: { forward: 'Sigue recto', left: 'Gira a la izquierda', right: 'Gira a la derecha', up: 'Sube un piso', down: 'Baja un piso' },
};
