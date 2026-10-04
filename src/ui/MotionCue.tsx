import type { Direction } from '@contracts/contracts.ts';

/** Peripheral dots that drift in the confirmed route direction. Never sensor-driven. */
export function MotionCue({ direction, still }: { direction: Direction; still: boolean }) {
  return (
    <div className="motion-cue" data-direction={direction} data-still={still} aria-hidden="true">
      <span className="motion-cue-strip" data-side="left" aria-hidden="true" />
      <span className="motion-cue-strip" data-side="right" aria-hidden="true" />
    </div>
  );
}
