# Guide motion cues

Status: implemented on `feat/motion-cues`, 2026-10-04 (user decision). Lead browser check done 2026-10-04 in desktop Chrome; physical-phone check pending.

## Behavior

The guide shows two thin dot strips in the gutter just outside the left and right edges of the guide column. They show only when the state is `guiding` and the direction is not null. This is the same gate as the arrow. Start, uncertain, reorient, off_route, arrived and null direction show no cue. The cue unmounts at once, with no exit animation. The component is keyed by direction, so a direction change restarts the loop.

- forward: dots drift upward.
- up: paired dots drift upward.
- down: paired dots drift downward.
- left / right: dots drift toward that edge.

The dots use `--on-night-muted` at 0.4 opacity and no state color. Direction comes only from guidance. No device motion, gyroscope or camera input is read. Reduced motion (`useReducedMotion` as `data-still`, and the `prefers-reduced-motion` media query) stops the loop. It then shows a static cluster: left shows only the left strip, right shows only the right strip, forward and up fade out downward from the top, and down fades out upward from the bottom.

## Files

- `src/ui/MotionCue.tsx` (new)
- `src/features/guide/GuideScreen.tsx`: renders the cue inside `section.guide`.
- `src/ui/theme.css`: `.guide` gets `position: relative`; cue rules follow the guide card transition rule.
- `knowledge/design-system.md`: dated motion decision.

CreatorScreen imports only `DIRECTION_TEXT` from `Arrow.tsx`. It does not render GuideScreen or MotionCue.

## Actual checks

- `npm run typecheck`: passed, exit 0.
- `npm run check`: passed, exit 0.
- `npm run build`: passed, exit 0.

## Lead browser check (2026-10-04)

Isolated `next dev` on port 3107 with a temporary data file. That file held the approved demo route (forward, left) and three test copies whose entrance direction was set to right, up and down. Mock observations only. Results:

- 1280px (desktop Chrome viewport 1536px) and 390px (an iframe with a true 390px viewport): for each of the five directions, the cue shows with the matching Arrow label. Strips sit outside the guide column: 3–13px and 362–372px at 390px; 229–239px and 885–895px beside the column at 242–882px on desktop. The mock panel starts at 930px. There is no horizontal overflow at 390px. On phone the strips end at the column bottom, above the stacked mock panel.
- Drift direction, read from the paused animation at 0, half and the end of one loop: forward 0→−12px y, up 0→−20px y, down 0→+20px y, left 0→−10px x, right 0→+10px x. Up and down use the paired two-layer 10×20px tile; forward uses the single 10×12px tile.
- Absent: start, uncertain (unrelated view), reorient (facing unclear) and arrived, at both widths. Forward→left remounts with the new direction.
- `data-still='true'`: no animation in all five directions. Forward/up mask toward the top, down toward the bottom, left hides the right strip, right hides the left strip. The `prefers-reduced-motion` media block is present in the loaded stylesheet.
- The creator page (`/`) has no `.motion-cue`.
- Screenshots: the dots read as small, low-contrast and peripheral on the night surface.

## Limits

- The OS reduced-motion setting was not toggled. The still state was checked by setting `data-still`, the path `useReducedMotion` drives.
- The tab was backgrounded, so smoothness and frame pacing were not observed live. Direction was read from the animation timeline.
- Not observed: a physical phone, motion comfort, outdoor or real-screen visibility, Safari/iOS rendering of `mask-image`, Spanish, and live/replay modes.
- The 390px check was an iframe in desktop Chrome, not device emulation.

## Next action

Commit on `feat/motion-cues`, open a PR, reconcile `PROGRESS.md` at merge. Check on a physical phone when available.
