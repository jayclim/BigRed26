# Claude handoff: local mock MVP (2026-10-03)

Built by Claude Code as lead and integration owner. The kit (`breadcrumb-kit/`), `CLAUDE.md` and `docs/TEAM-HANDOFF.md` were not modified.

## Files created

| Area | Files | Owner from now on |
|---|---|---|
| Contracts | `contracts/contracts.ts` (v1 copy plus 2 amendments), `contracts/schemas.ts` (zod), `contracts/fixture.v1.json` (kit fixture copy), `contracts/AMENDMENTS.md` | Integration owner |
| Core | `src/server/core/core.ts` (state machine and CoreAdapter), `store.ts` (safe JSON load/persist), `instance.ts` (singleton wiring), `http.ts` (Result → HTTP status), `core.check.ts` | Integration owner |
| API | `src/app/api/routes/[id]/{route,draft/route,approve/route,quality/route}.ts`, `src/app/api/sessions/route.ts`, `src/app/api/sessions/[id]/{route,locale/route,frame-sequence/route,frame/route,guidance/route}.ts` | Integration owner |
| App mounting | `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/follow/[routeId]/page.tsx` | Integration owner |
| Client adapter | `src/client/httpCore.ts` (CoreAdapter over fetch) | Integration owner |
| Mock input | `src/shared/mockScenes.ts` (scene list and mock recognizer) | Integration owner |
| UI (initial scaffold) | `src/features/creator/CreatorScreen.tsx`, `src/features/guide/GuideScreen.tsx`, `src/features/guide/Camera.tsx`, `src/ui/theme.css`, `src/ui/Arrow.tsx`, `src/ui/Brand.tsx` | **Person 1** |
| Root config | `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Integration owner |
| Tooling and docs | `scripts/isolated-server.mjs`, `scripts/smoke-api.mjs`, `scripts/screenshots.mjs`, `docs/screenshots/*.png`, `README.md`, this file | n/a |

## Test results (actual output, this machine)

- `npm run check`:
  `core check passed: approval, unknown scene, reorient, arrival, stale ordering, provider failure, locale preservation`
- `npm run typecheck` (`tsc --noEmit`): no errors.
- `npm run build`: compiled successfully. 13 routes listed.
  - **Bug found and fixed:** build workers raced on writing the store at import. The store is now written only on mutations, with a per-process temp file.
- First build, smoke test against a production server with fresh data (now `node scripts/smoke-api.mjs`, which uses isolated data): `smoke passed`. Observed responses:
  - unapproved session start: `409`
  - bad draft: `400`
  - partial review: `409`
  - approve: `200`
  - live session: `503`
  - unknown scene: `uncertain`
  - reorient, then guiding forward, then guiding left (with the edited text)
  - recognizer failure: `503`
  - Spanish guidance for the same mural/left position
  - arrived (`Has llegado a la sala 204.`)
  - replayed sequence 1: `409 STALE_FRAME`
- Persistence: after approval, restarting the server still returned `approved 1` with the edited text.
- Screenshots, captured with headless Chrome using its **fake** camera device; this is not a real device test:
  - `docs/screenshots/01`–`12` cover: creator draft, creator approved, start, uncertain, reorient, guiding, provider error, Spanish, camera on, arrived, desktop and camera denied.
- **Not tested:**
  - a real phone or a real camera
  - browser speech output (I did not listen to it)
  - keyboard-only navigation (focus styles exist, but nobody has walked through it)
  - an HTTPS origin

## Review pass (2026-10-03, after Codex added the project brain)

I read `AGENTS.md`, `CONTEXT.md`, `stages/03-build/CONTEXT.md`, `knowledge/reuse.md`, `knowledge/design-system.md` and the `breadcrumb-design` and `breadcrumb-verify` skills.

**Skill discovery:** `.claude/skills/*` and `.agents/skills/*` are symlinks to `skills/*`, and they resolve. All three skills (`breadcrumb-design`, `breadcrumb-knowledge`, `breadcrumb-verify`) appear in this Claude Code session's skill list.

1. **Safe store loading.**
   - Load and persist moved to `src/server/core/store.ts`.
   - `loadState` seeds the fixture **only on `ENOENT`**. Other read errors (e.g. `EISDIR`), invalid JSON, or the wrong shape (zod: routes fully validated, sessions and events by container shape) return `{ok:false, message}` and write nothing.
   - In that case `instance.ts` logs the reason and serves a core where every call returns `503 PROVIDER_UNAVAILABLE` with that message. The file is never overwritten.
   - Regression check added to `npm run check`, using a `mkdtemp` directory:
     - a missing file seeds without writing anything;
     - a persist/load round trip works;
     - truncated JSON, foreign JSON and an empty file each fail and stay byte-identical;
     - a directory path fails with `EISDIR`.
   - **Shown to catch the bug:** I temporarily restored catch-all seeding, and the check failed with `AssertionError: must not seed an unreadable path`. Reverted, it passes again.
2. **Isolated test data.**
   - New `scripts/isolated-server.mjs` starts the built app with `BREADCRUMB_DATA_FILE` in a fresh `mkdtemp` directory.
   - `smoke-api.mjs` and `screenshots.mjs` both use it. Neither recommends `npm run reset` any more.
   - Chrome profiles use native `mkdtempSync`, not a fixed `/tmp` path.
   - Each script removes only its own temp directories, and the server is stopped on exit, including when an assertion fails.
   - `screenshots.mjs` now also reports `scrollWidth` against viewport width for each shot.
   - The README marks `npm run reset` as destructive and not needed for testing.
   - **Also fixed:** the first version left the spawned server holding the event loop open, so the script hung. Both scripts now end with `process.exit`.
3. **UI polish, in place.** Same Atkinson Hyperlegible font, same CSS tokens and primitives, no new dependency or assets.
   - **Brand:** `src/ui/Brand.tsx` is a wordmark built from the existing trail motif (cyan crumbs on a dotted path, solid destination). It is mark-only on guide screens ≤ 480px.
   - **Guide header:** the Mock label moved onto the camera area as "Mock" plus "Camera not analyzed" (Spanish: "Simulado" plus "La cámara no se analiza"). The long fiction paragraph was removed.
   - **Copy:** the mock panel intro is one sentence and still says the building is fictional. The creator note is one sentence. The camera placeholder is just "Camera off".
   - **Instruction:** larger (`clamp(1.65rem, 7vw, 2.2rem)`, balanced wrapping).
   - **Phone stage:** `min-height: 30dvh` instead of a fixed height, so recovery text isn't clipped. The placeholder clears the Mock label.
   - **Spanish sound labels:** shortened to "Sin sonido"/"Con sonido" so the controls fit on one row at 390px.
4. **Results from this pass (actual output):**
   - `npm run check`: `core check passed: approval, unknown scene, reorient, arrival, stale ordering, provider failure, locale preservation, safe store loading`.
   - `npm run typecheck`: clean.
   - `npm run build`: compiled successfully.
   - `node scripts/smoke-api.mjs 3107`: `smoke passed` against its own temp data file.
   - `node scripts/screenshots.mjs 3107`: 12 shots, all reporting `no overflow`, at 390px (phone) and 1280px (desktop).
   - **Screenshots inspected:** 01, 06, 08, 10, 11, 12. They showed two problems, both fixed and re-captured:
     - the Spanish controls wrapped under the brand;
     - the denied-camera message collided with the Mock label.
   - The project's `.data/` did not exist before or after the runs; the scripts never created or touched it. No test server process was left running.
   - **Known render artifact:** the full-page creator capture shows the sticky approve bar part-way down the page. This comes from `captureBeyondViewport` with a sticky element, not the live layout.
   - **Still untested:** real phone, real camera, speech output, keyboard-only walkthrough.

### Proposed documentation updates (Codex-owned; not edited by me)

- **`PROGRESS.md`:** the local mock MVP is implemented and verified with the results above. Next action: shared repository, real route footage, HTTPS origin.
- **`stages/03-build/output/implementation.md`:** replace "build in progress" with a pointer to this handoff. Add `store.ts`, `Brand.tsx` and `scripts/isolated-server.mjs`. Note contract v1.1 (`contracts/AMENDMENTS.md`).
- **`stages/04-verify/output/verification.md`:** record the command results above, and that the screenshots use a fake camera (mock mode, macOS headless Chrome).
- **`knowledge/design-system.md`:**
  - Typography still says local Avenir Next. The implemented font, which the user asked to keep, is Atkinson Hyperlegible via `next/font`.
  - The implemented tokens in `src/ui/theme.css` differ from the doc's working tokens. For example, paper is `#fbf8f3` (doc `#F7F8F5`) and cyan is `#19c3dc` (doc `#45DCE3`).
  - Either update the doc to match, or decide to move the CSS to the doc's tokens. Both are inspected in renders.
- **`knowledge/reuse.md`:**
  - Add `src/ui/Brand.tsx` (trail-motif wordmark, no external asset) under design primitives.
  - Add `scripts/isolated-server.mjs` as the reusable way to run checks against throwaway data.
- **`skills/breadcrumb-verify/SKILL.md`:** name `node scripts/smoke-api.mjs` and `node scripts/screenshots.mjs` (after `npm run build`) as the existing isolated checks. They already satisfy the skill's "do not reset storage" rule.

## Entry points for Person 1 (interface)

```ts
// src/features/creator/CreatorScreen.tsx
export function CreatorScreen(props: { core: CoreAdapter; routeId: Id; followPath: string }): JSX.Element
// src/features/guide/GuideScreen.tsx
export function GuideScreen(props: { core: CoreAdapter; routeId: Id; exitHref: string }): JSX.Element
// QualityScreen: not created. Use core.routeQuality(routeId, version, since, mode). It defaults to live, so label mock data.
```

- `core` is `httpCore` from `src/client/httpCore.ts`, mounted in `src/app/page.tsx` and `src/app/follow/[routeId]/page.tsx`.
- The screens call only `CoreAdapter`, including the amended `approveRoute(id, version, reviewedIds)` and `currentGuidance(sessionId)`.
- Mock scenes come from `mockScenes(route)` in `src/shared/mockScenes.ts`.
- Rules to keep:
  - show an arrow only for `state === 'guiding'`
  - keep at most one match in flight
  - ignore responses older than the last accepted sequence
  - ignore `STALE_FRAME` silently
  - never advance on a timer
- Open items:
  - help control (no event endpoint yet; ask the owner)
  - keyboard and focus audit
  - real phone checks
  - a Spanish mock panel, if wanted

## Entry points for Person 2 (voice, messaging, demo)

- **Voice:**
  - Implement `VoiceAdapter` in `src/server/voice/` (for example, export `voiceAdapter: VoiceAdapter`).
  - The owner then registers `POST /api/speech` (body `SpeechRequest` → `Result<SpeechClip>`) and swaps the guide's browser-speech effect in `GuideScreen.tsx` for the clip.
  - The guide must still dedupe by `instructionId` and cancel stale audio.
  - `instructionId` is stable per checkpoint, locale and route version, for example `mural-es-v1`.
- **Replay:**
  - Implement a `Recognizer` (`(route, FrameRequest) => Promise<Result<Observation>>`, exported from `src/server/core/core.ts`) in `src/demo/`.
  - The owner registers it as `recognizers.replay` in `src/server/core/instance.ts`. Replay sessions are then labeled `replay` everywhere.
- **Messaging:** `MessageAdapter.handlePhotoHelp(request, core)` must call `core.reserveFrameSequence` and then `core.matchFrame`. This is the same allocator the browser uses.
- Environment variable names:
  - `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ENABLE_VOICE`
  - `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET`, `ENABLE_PHOTON`
  - `DEMO_INPUT`

## Changes needed in `docs/TEAM-HANDOFF.md` (Codex owns it; I did not edit it)

1. **App structure:** Next.js App Router, so `src/app/api/**` is literal. Single-process JSON store at `.data/store.json`.
2. **Contract v1.1:** add `approveRoute(..., reviewedCheckpointIds)` and `currentGuidance`. Point to `contracts/AMENDMENTS.md`.
3. **Person 1:** `CreatorScreen` and `GuideScreen` signatures as above. `QualityScreen` is not scaffolded yet. `src/features/guide/Camera.tsx` also belongs to Person 1.
4. **Person 2:** the replay input is a `Recognizer` registered as `recognizers.replay`, not a UI fixture. The `/api/speech` route is not registered yet.
5. **No repository yet:** this directory is not a git repository. A shared repository is still needed before branches and ownership start.

## Codex verification follow-up

The shared brain and team documents now reflect the implemented font, palette, contracts and entrypoints. Codex tightened `isolated-server.mjs` to wait for its own child to bind before probing a port, with `isolated-server.check.mjs` proving an occupied unrelated server receives no requests. The HTTP smoke journey passed afterward. Screenshot browsers now use dynamically assigned debugging ports read from their unique profiles, avoiding another browser's debugging endpoint. See `stages/04-verify/output/verification.md` for the current consolidated evidence.

## Next steps for the integration owner
1. `git init` and a shared repository (user decision).
2. The real route video, then Gemini extraction into a draft.
3. A live recognizer with a tuned frame window.
4. An HTTPS origin for phones.
5. Register the speech endpoint when Person 2 delivers.
