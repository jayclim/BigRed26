# Guide redesign (Part B)

Status: implemented on `feat/guide-redesign`, not committed. Code checks pass. Rendered review by the lead is pending. Date: 2026-10-03. Source: approved mockup `Main.dc.html` (phone) and `GuideDesktop.dc.html` (desktop) in the lead's scratchpad.

## Decisions

Look:
- Dark immersive screen. Ground #0f1316, surface #181d21, surface-2 #20262b, rule #2c343a, todo #3a444b, text #f4f7f8, muted #a3b0b7, cyan #2fd0e6 (text on it #04252c), amber #f2b84b, green #3ddc84 (text on it #06301a).
- `guide.module.css` re-points the global guide variables (`--night`, `--cyan`, `--amber` and others) on `.guide-page` only. Global guide rules then use the new palette with no `theme.css` edit. Creator pages do not change.
- Soft state glow: a 2px radial-gradient frame behind the instruction card. Cyan plus violet while guiding. Amber for uncertain, reorient and off_route. Green plus cyan for arrived. Faint white before the first check. The glow changes instantly.
- Pill controls (radius 999px), card radius 22px on phones and 26px on desktop, stage radius 22/26px. Mock scene buttons use 12px.
- System font stack stays. Instruction weight 800, letter-spacing -0.025em, size clamp(24px … 34px). State label 12px, weight 800, uppercase, tracked.

Motion cue (replaces the Arrow in the guide; `src/ui/Arrow.tsx` is unchanged and still supplies `DIRECTION_TEXT`):
- Five dots in a row (left/right) or a column (forward/up/down). Each dot runs a 1.1s opacity/scale keyframe, staggered 0.16s from the tail. The head dot is at the direction end: left = first, right = last, forward/up = top, down = bottom.
- The cue flows only when `guidance.state === 'guiding' && guidance.direction` (the same condition as `data-arrow='shown'`). In every other state the dots are still.

Route map:
- Schematic, subway style. Every edge is one equal step; length means nothing.
- Start heading is up the screen. A checkpoint bends the line only when its approved `direction` is left/right, or its action is `turn` with a side. Door, pass_side and other actions with a side do not bend.
- An edge gets a floor chip when the checkpoint direction is up/down or the action is elevator/stairs. Text is `Floor <targetFloor>` when present, otherwise Up/Down. If the direction is unknown, the glyph is ↕ and the text is "Change floor" or the floor name. ▲/▼ appear only for an approved up/down direction. This differs from the mockup, which shows ▲ for Lift A; the fixture has no up/down data for it.
- If two nodes share a grid point, the layout falls back to a straight vertical line. On a unit grid this also covers overlapping edges.
- Labels sit beside nodes on the side with no horizontal edge and more room. A node inside a horizontal run lifts its label above the line. Long labels truncate with an ellipsis; the sr-only list keeps the full text.
- Step size is 60px; wide layouts shrink it (minimum 32px) so the graph fits.

Layout:
- Phone (<900px): top bar, camera stage, instruction card with glow, "This step" card (only for an active action), map card, then the mock panel.
- Desktop (>=900px): route name beside the brand. Left column: camera (16:9) and instruction card. Right column (380px): map card, then "This step". The mock panel spans the full width below and stays secondary.
- Action details (target, side, floor, steps, completion, active-action note and the manual button) moved from inside `.card` to a "This step" section. The `action-details` class is kept on it.

## Proposed amendments to knowledge/design-system.md (integration owner)

The current text forbids some of this. Proposed replacements:

1. Motion section, replace "Do not add infinite decorative motion." with: "Infinite motion is limited to the guide direction cue and the three dots on the active map edge. Both loop only while guidance is `guiding` with a non-null direction (confirmed approach). They stop in every other state and under reduced motion."
2. Motion section, replace "Do not animate route progress, arrows or the camera to suggest observed movement." with: "Do not animate route progress, the map position marker or the camera. The direction cue may pulse in place; it never moves position or implies distance."
3. Token table, Radius row: add "Guide only: 16–26px cards and stage; pill (999px) controls."
4. Guide paragraph: replace "Never add an arrow without confirmed orientation." with "Never show a flowing direction cue without confirmed orientation. Still dots carry no direction."
5. Guide palette: add the guide-scoped token values listed above, noting they override the global night tokens on `.guide-page` only.
6. Type: "Figtree (mockup font) is deferred. A web font needs an owner decision on loading and licensing; the guide keeps the system stack."
7. Visual language: the first status line says the pill-control direction was superseded. Record that the guide now uses pills by user decision on 2026-10-03; the creator does not change.

## State behavior

| State | Glow | Cue | `data-arrow` | Map |
|---|---|---|---|---|
| start (no guidance) | faint white | 5 grey still dots, label "No direction shown" | none | no current node; node 1 outlined as next; "Not started" |
| guiding, direction set | cyan + violet | flowing toward the direction, label from `DIRECTION_TEXT` | shown | current node with white border and cyan halo; active edge 35% cyan with 3 pulsing dots |
| guiding, direction null (action step) | cyan + violet | 5 dim cyan still dots, "No direction shown" | none | current node; active edge 35% cyan; no dots |
| uncertain / reorient / off_route | amber | 5 amber still dots, "No direction shown" | none | last confirmed node stays current; no active edge, no dots |
| arrived | green + cyan | green check circle (decorative; state text says "Destination confirmed") | none | destination node green with halo; all edges done |

The floor tag beside the state label appears only while guiding at a checkpoint with a floor change.

## Accessibility and reduced motion

- The cue is `role="img"`. Its label is `DIRECTION_TEXT[locale][direction]`, or "No direction shown" / "No se muestra ninguna dirección".
- The map is `role="img"` with a summary label (step n of N, current label, next label, or arrived). A sibling `ol.sr-only` lists each checkpoint as `label: status`, using the existing status values.
- `prefers-reduced-motion` and Motion's `useReducedMotion` both stop the cue and edge dots. Cue dots then stay still, graded toward the head: 1, .7, .45, .28, .16. Edge dots stay still at .4/.7/1 toward the next node. The global reduced-motion rule in `theme.css` still applies.
- The marker and progress change instantly with accepted guidance. Nothing is timer-driven.
- Controls keep a 44px minimum height and the existing focus ring. Todo labels use #8a969d (5.6:1 on #181d21); muted text is 7.6:1.

## Files changed

- `src/features/guide/GuideScreen.tsx` (presentation only; lifecycle, matching, session, voice, locale and manual completion code unchanged)
- `src/features/guide/MotionCue.tsx` (new)
- `src/features/guide/RouteMap.tsx` (new)
- `src/features/guide/routeMap.ts`, `routeMap.check.ts` (new, pure layout and its check)
- `src/features/guide/guide.module.css` (new)
- `src/features/guide/mode.module.css` (pill badge; cyan primary "Check this view")

Kept: `.card` with `data-state`, `data-sequence`, `data-arrow`, `aria-live`, `aria-busy`; `.say`, `.state`, `.stage-label`, `.mock-panel`, `.cam-stop`, `.placeholder[role=alert]`, `main[lang]`, and all button texts. Removed from the guide: `.crumbs`, `.crumb-labels`, `.sign`, `.sign-empty` markup (the global CSS for them remains).

## Checks (2026-10-03, this host)

| Command | Result |
|---|---|
| `node src/features/guide/routeMap.check.ts` | Exit 0, 8 PASS lines |
| `node src/features/guide/checkView.check.ts` | Exit 0 |
| `node src/features/guide/voicePlayback.check.ts` | Exit 0, "PASS all 8 regression groups" |
| `npm run check` | Exit 0 |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0 (Turbopack) |
| `node scripts/follow-camera.check.mjs` | Exit 1 at the first `.say` text assertion. HEAD without this change also fails after the same three PASS lines, with the same falsy-assertion message (2 of 2 runs). Cause: the `AnimatePresence mode="wait"` text crossfade keeps the old `.say` in the DOM for about 120ms after `aria-busy` turns false. A scratch copy that waits 500ms before reading `.say` passed every remaining assertion with this redesign, including 390/1280 control overlap, keyboard Tab/Enter, locale and denied-camera checks. |

The browser check saved screenshots as a side effect. They are not a visual review.

## Lead follow-up (2026-10-04, host, Node 24.21.0)

- Confirmed the `.say` race on unchanged main: `node scripts/follow-camera.check.mjs` fails at the same assertion on `origin/main` `e7bc7c5`. Fixed the check (Part B file): it now waits until exactly one `.say` shows the accepted instruction. With the redesign it passes all groups (8 PASS lines), twice.
- Added a static blurred halo behind the instruction card (`.glow::before`, same state gradient, no animation). The 2px tinted edge alone was too faint in renders.
- Rendered review with a scratch CDP harness (not committed): mock mode, `demo-route` and `action-fixture`, 390x844 and 1280x800. States: start, forward, reorient, turn left, uncertain, provider error, arrived, turn left in Spanish, turn left with reduced motion, door action. 20 screenshots, each inspected; no horizontal overflow (`scrollWidth - innerWidth = 0`).
- Observed: cue flows only in guiding states with a direction; reorient and uncertain show still amber dots; door action (direction null) shows still dim dots; arrival shows the green check and a green destination node. Map bends left on the legacy fixture and stays straight on the action fixture, with a `Floor 3` chip on the lift edge. Spanish strings fit at both widths. Reduced motion shows static dots graded toward the head.
- Still not seen: a real phone, real camera frames, motion feel over time (screenshots are single frames), and screen-reader output.
- Open, non-blocking: on phones the brand shows only the trail mark (pre-existing compact brand); reorient does not highlight the candidate node; the desktop map sits right of center in its card.

## Limitations

- No real-phone review. See the lead follow-up for rendered states.
- The glow and card colors do not transition between states.
- Very wide layouts (many same-direction turns) shrink the step to 32px, which can truncate labels to nothing; the sr-only list still carries them.
- Labels on different nodes are not checked against floor chips.
- "This step" details no longer sit in the `aria-live` card, so screen readers no longer hear them automatically. The card still announces the approved instruction.

## Next action

The integration owner decides on the design-system amendments above and adds `node src/features/guide/routeMap.check.ts` to `npm run check`. Then test on a real phone over a secure origin.
