# Breadcrumb design system

Status: user decision and implemented foundation, 2026-10-03. This supersedes the Atkinson, pill-control and large-card direction. Fresh rendered review is pending because the worker sandbox blocks HTTP listeners.

## Visual language

Use a clear product interface for teaching and following one indoor route. Keep the Breadcrumb name and trail mark. Show the checkpoint sequence through small numbered nodes and thin connecting rules. Use whitespace and hairline dividers to group fields. Use one cyan action accent. Reserve amber, green and red for explained states. Do not build a marketing hero, dashboard or nested card layout.

The executable source is `src/ui/theme.css`. Keep these tokens there:

| Role | Token / value |
|---|---|
| Canvas / supporting surface | `--paper` #ffffff / `--paper-2` #f5f7f8 |
| Text / secondary text / divider | `--ink` #18272d / `--muted` #5c6b73 / `--rule` #dce3e7 |
| Action / guide confirmation | `--cyan-ink` #076b7e / `--cyan` #21bed4 |
| Camera chrome / instruction surface | `--night` #101b22 / `--night-2` #182730 |
| Guide text / secondary text | `--on-night` #f3f7f9 / `--on-night-muted` #b1c0c8 |
| Type | System sans; 12, 13, 15, 18, 32px. Guide instruction: 24–30px |
| Space | 4, 8, 12, 16, 24, 32, 48px |
| Radius | 6, 8, 10px; circles only for route nodes |
| Shadow | Small control shadow and restrained sticky-bar shadow |
| Motion | 120, 160, 240ms; entrances finish within 400ms; creator status uses 160ms |

Computed contrast checks: primary on white 6.15:1; secondary text on white 5.52:1; guide text on its surface 14.20:1; guide secondary text 8.20:1. These pairs do not establish whole-screen accessibility. Always name the state in text.

## Primitives and composition

Use the adapted shadcn Button, Input, Textarea and Badge in `src/ui/`, with `cn` for class merging. Button variants are primary, outline and ghost. Keep native selects and review checkboxes. Controls retain 44px tap targets, visible focus and full labels. Map Tailwind v4 and shadcn semantic colors to Breadcrumb tokens. Import Tailwind theme and utilities only. Do not enable preflight: the guide uses its existing class and DOM interface.

Use the system font stack without a build-time font download. Keep labels at medium weight and route names compact. Use 16px input text on phones. Keep English and Spanish fields side by side on desktop and stacked on phones.

Creator: show route name, draft/approved status and endpoints first. Put video upload and testing tools beside the checkpoint editor on desktop; stack them on phones. Keep testing tools secondary. Use a sticky save/approve bar and a clear visitor-link panel. Preserve all extraction warnings, input focus, ordered action controls and review requirements.

Guide: foreground route progress and the current instruction. Keep the camera available and mock status explicit. Restyle existing selectors only; do not change guide lifecycle, navigation or camera behavior from a shared design task. Keep synthetic observation controls dark and secondary. Retain honest uncertainty, manual evidence and arrival text. Never add an arrow without confirmed orientation.

## Motion and review

User decision, 2026-10-03: the user requested a smooth, animated UI. Motion now covers screen entrance, control press feedback, state text crossfade and a single checkpoint review pop. Keep the existing palette, fonts and layout. Use the spring-like ease-out for entry and feedback, and ease-in for exits. Creator entrance uses a 10px rise; trail items stagger by 32ms with a 160ms delay cap. All page entrance motion finishes within 400ms. Guide chrome, stage and card fade once on mount.

The root MotionConfig keeps `reducedMotion="user"`. `useReducedMotion` removes opacity/translate transition time when requested. CSS disables animations and transitions under `prefers-reduced-motion`, including press and hover transforms. Creator notices stay in normal flow during opacity/translate exits; no height or layout animation is used. Guide state and instruction text use `AnimatePresence mode="wait"`; the card border color transitions with state. Review nodes change color and pop once after a review action. The approved visitor-link panel fades and rises on mount. Inputs have border and soft cyan focus-shadow transitions, with visible focus outlines and no mount animation.

Keep the progress, arrow and camera constraints. Do not animate route progress, arrows or the camera to suggest observed movement. Progress dots and links remain instant in this change. No lifecycle, navigation, camera, route state or data flow changes are part of motion polish. Do not add infinite decorative motion.

Inspect 390px and 1280px renders before accepting visual quality. Check editor, upload, unsaved extraction recovery, approved/share, guiding, uncertainty, reorientation, arrival, errors and Spanish. Check keyboard focus, sticky-bar overlap and actual horizontal overflow. A successful build or computed contrast pair is not a rendered review or physical navigation gate.
