# Visual foundation checks

Status: code checks passed; default Turbopack build and browser capture blocked by the sandbox. Date: 2026-10-03. Node: 24.11.1. Next.js: 16.3.8. Branch: feat/design-system; base: 14456b0.

Observed commands on the changed tree:

| Command | Actual result |
|---|---|
| `npm run check` | Passed core and media checks, and 32 extraction cases. No provider calls. |
| `npm run typecheck` | Passed. |
| `npm run build` | Blocked: Turbopack PostCSS worker cannot bind a port, `Operation not permitted (os error 1)`. |
| `npm run build -- --webpack` | Passed production compile, TypeScript, page generation and traces. Includes creator and follow routes. No font fetch. |
| `node scripts/screenshots.mjs 3160` | Blocked before browser startup: `listen EPERM 0.0.0.0:3160`. Temporary data helper used; no screenshots taken. |
| `git diff --check` | Passed. |
| `git diff --exit-code -- src/features/guide src/server src/client scripts contracts` | Passed: no changes in these paths. |

Computed token contrast: light text 15.36:1, light secondary text 5.52:1, primary button text 6.15:1, guide text 14.20:1, guide secondary text 8.20:1, cyan guide state text 6.84:1. These checks cover specified pairs only.

Before screenshots were inspected from the root checkout's `.overnight/visual-demo/screenshots/`. They are inputs, not evidence for the new design. Fresh 390px/1280px renders, focus continuity, upload/extraction recovery, full action editing and Spanish wrapping remain unverified in this worker. No physical camera, location, live recognition or provider result is claimed. Ports 3000 and 3010 were not touched. `.env.local` was not read.

Guide PR risk: no guide source conflict is introduced, but global theme selectors change `.stage`, `.card`, `.ctl`, `.crumbs`, `.sign` and `.mock-panel`. The lead must inspect feat/follow-camera after integration for selector precedence, added DOM and camera sizing. Tailwind preflight is omitted. Motion adds no guide lifecycle or navigation behavior.

Next action: run the default build and screenshots on the host, including the merged follow-camera states. Keep the standard build command; Webpack was a sandbox verification fallback.

## Cascade repair

- 2026-10-03: Moved root typography, element resets, link color, focus and `.sr-only` defaults into `base`; button/badge slots, badge classes and creator button/field/file-control rules (including phone field typography) into `components`. Declaration values are unchanged; both 2px solid focus outlines remain.
- Computed sRGB token contrast: primary label `#ffffff` on `#076b7e` 6.15:1; link `#076b7e` on paper 6.15:1, paper-2 5.73:1 and share surface 5.53:1. All exceed 4.5:1.
- Local Button/Input/Textarea/Badge are small separate shadcn adaptations with MIT provenance comments; layout wraps children in MotionProvider, and creator status/messages use motion. No upstream source was fetched in this repair.
- Actual checks: `npm run check` PASS (core, media, 32 extraction cases; no network calls); `npm run typecheck` PASS (`tsc --noEmit`, exit 0). The stylesheet parsed with installed PostCSS for layer/token inspection. No build, server or browser ran in this repair.
- Host next: Webpack build, fresh phone/desktop screenshots including primary button/link labels and keyboard focus, and CI normal build. Rendered cascade behavior remains unverified here.

## Host checks after cascade repair (2026-10-03)

- `npm run build -- --webpack`: pass. The normal Turbopack build still fails on this host with a PostCSS port-bind `EPERM` (sandbox issue). CI must run the normal build before merge.
- Private screenshot capture: 12 states, no horizontal overflow at 390 and 1280 px. "Open guide" shows white text on the teal primary.
- Private extraction harness (status text updated to `Unsaved`, focus check set to the documented 2px outline): `RESULT PASS`. Request and state assertions are unchanged.
- Next: independent review of the exact PR commit.
