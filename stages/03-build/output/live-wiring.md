# Live wiring

Date: 2026-10-03. Branch: `feat/live-wiring`. Base: `9f20f8b`.
Evidence status: fake providers and local HTTP only. No live Gemini call, no live ElevenLabs call, no browser and no physical device was used.

## What is wired

1. **Live recognizer.** `src/server/core/instance.ts` registers `liveRecognizer` (from `src/server/recognition/gemini.ts`) under `live`. It registers only when `liveRecognitionEnabled()` is true: `BREADCRUMB_GEMINI_RECOGNITION=1` and `GEMINI_API_KEY` set. If not, `live` is absent and `startSession(..., 'live')` fails with `PROVIDER_UNAVAILABLE` as before. There is no fallback to mock. The flags are read once when the server process starts.
   Frame path checked by reading code: the guide uploads a JPEG to `POST /api/frames`. `saveFrame` stores it as `frame_<uuid>.jpg` in `BREADCRUMB_FRAMES_DIR` (default `.data/frames`) and returns an opaque `mediaId`. `matchFrame` passes that `mediaId` to the recognizer. The recognizer calls `readFrame(mediaId)` on the same default directory. The id must match the frame id pattern. `recognizer.check.ts` already stores a frame with `saveFrame` and recognizes it through `createCore`.
2. **Voice adapter.** `src/app/follow/[routeId]/page.tsx` passes `voice={httpVoice}` to `GuideScreen` only when the server says generated voice is on. New probe: `GET /api/speech` returns `{ ok: true, value: { enabled } }` (boolean only, no keys, `force-dynamic`, `no-store`). Client helper: `serverVoiceEnabled()` in `src/client/voice.ts`. Server flags: `BREADCRUMB_ELEVENLABS_VOICE=1` and `ELEVENLABS_API_KEY`. When the probe says false, fails, or has not yet returned, `GuideScreen` has no `voice` prop and uses the labeled "Browser speech" path.
   If the probe says true but `/api/speech` later returns `PROVIDER_UNAVAILABLE` (or a network error), `createVoicePlayer` shows "Voice unavailable. Captions still shown." Captions, guidance and the camera check keep working. This case does not fall back to browser speech; this is existing player behavior, covered by `voicePlayback.check.ts`.
3. **Core hardening.** `sessionOf` in `src/server/core/core.ts` uses `Object.hasOwn`. Regression in `core.check.ts`: `__proto__`, `constructor`, `toString`, `hasOwnProperty` return `NOT_FOUND` from `getSession`, `setLocale`, `reserveFrameSequence` and `matchFrame`. Without the fix, the check fails at `getSession __proto__` (observed). Route lookups (`getRoute`, `startSession`) use the same own-property check, and `saveDraft` rejects reserved ids such as `__proto__` with `INVALID_INPUT`; the same regression covers them.
4. **Upload connection.** `src/app/api/media/route.ts` adds `Connection: close` to every rejected upload (wrong content type, bad or oversized Content-Length, and any failed `storeMediaUpload`, including the over-cap chunked body). The 400 `INVALID_INPUT` envelope is unchanged. `scripts/smoke-api.mjs` now asserts the header on the chunked over-cap response and on the non-multipart response. The smoke test keeps its separate-connection workaround for the over-cap request; it was not removed.
5. **Checks in CI.** `npm run check` now also runs `recognizer.check.ts`, `frames.check.ts`, `voice.check.ts`, `voicePlayback.check.ts` and `checkView.check.ts`. CI adds `node scripts/follow-frames.check.mjs` (local HTTP, after the build). `scripts/follow-camera.check.mjs` is excluded: it launches `/Applications/Google Chrome.app` (macOS path) with a fake camera, so it needs a browser. Other scripts under `scripts/` that are not in CI: `voice-smoke.mjs`, `voice-harness.mjs` (manual harnesses), `screenshots.mjs` (browser).
   Repair: `voicePlayback.check.ts` failed on main (exit 1) because it asserted the caption markup `<p className="say">`; the motion layer (#19) changed it to `<motion.p ... className="say">`. The assertion now looks for `className="say"`.

## Env flags

| Flag | Needed for |
|---|---|
| `BREADCRUMB_GEMINI_RECOGNITION=1` + `GEMINI_API_KEY` | live recognizer registered (optional `GEMINI_MODEL`) |
| `BREADCRUMB_ELEVENLABS_VOICE=1` + `ELEVENLABS_API_KEY` | generated voice (optional `ELEVENLABS_VOICE_ID`) |
| `BREADCRUMB_FRAMES_DIR` | frame storage shared by upload and recognizer |

`scripts/smoke-api.mjs` now also clears and disables `BREADCRUMB_GEMINI_RECOGNITION` and the ElevenLabs flags for its child server, and asserts the probe returns `enabled: false`.

## Checks run (Node 24.11.1, this worktree)

| Command | Exit |
|---|---|
| `npm run check` | 0 |
| `npx tsc --noEmit` | 0 |
| `npx next build --webpack` | 0 (`/api/speech` is dynamic) |
| `node scripts/smoke-api.mjs` | 0 (`smoke passed`) |
| `node scripts/follow-frames.check.mjs` | 0 |
| `git diff --check` | 0 |
| Throwaway isolated server with fake keys and both flags on (script deleted after): live session starts, `GET /api/speech` gives `enabled: true`. No frame sent, so no provider call. | 0 |

## Limits

- No live Gemini or ElevenLabs request was made. The Gemini request shape stays unverified (see `gemini.ts`).
- No rendered UI, browser or phone check of the voice probe or the browser-speech label switch. The probe is async: if guidance is spoken by browser speech before it returns, the current instruction is spoken again in the generated voice when it does.
- `Connection: close` is checked on the Node server through `next start`. Behind another proxy or host, the header may be handled differently.
- `src/server/recognition/gemini.ts` imports `DEFAULT_GEMINI_MODEL` and `MAX_PROVIDER_RESPONSE_BYTES` from `src/server/extraction/extraction.ts`. A parallel change to those exports would break this import.
- The route hardening was added after the public demo returned 500 for `/api/routes/constructor`.
