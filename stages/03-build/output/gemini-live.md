# Gemini Live streaming guide

Date: 2026-10-03. Branch: feat/gemini-live. Status: built and checked against the real Gemini Live API (Node and headless Chrome with a fake camera). Not checked on a phone.

## Behavior

- New mode: `/follow/[routeId]?mode=stream`. Other modes (mock, live, replay) are unchanged. The core `decide` logic is unchanged.
- The guide page has a new link "Use live voice guide" (Spanish: "Usar guía de voz en vivo") that opens this mode.
- The user presses "Start live guide". This click creates the AudioContext, then asks for the rear camera (`facingMode: environment`).
- The browser calls `POST /api/live/token` with `{ routeId, locale }`. The server returns a short-lived, single-use ephemeral token and the setup. The browser opens the Gemini Live WebSocket with that token. The long-lived `GEMINI_API_KEY` never leaves the server.
- The browser sends one JPEG frame per second (long edge 640 px, quality 0.7, under 512 KB, reused `captureFrame`). It skips a frame if the socket buffer is over 1 MB.
- The model audio (24 kHz 16-bit PCM) plays through Web Audio, scheduled back to back (gapless). An `interrupted` message clears the queue.
- Captions come from `outputTranscription`. A "LIVE · Gemini" badge shows while the session runs.
- The microphone is off by default (ambient noise can interrupt the guide). "Turn mic on" asks for permission, streams 16 kHz PCM in 100 ms chunks, and "Mute mic" stops it. Mic failure does not stop the camera guide.
- Stop button, and unmount cleanup: closes the socket, stops camera and mic tracks, closes the AudioContext.
- Errors shown to the user: server not enabled, token failure, camera denied or missing, socket failure, mic denied, and connection ended after 3 reconnect tries (tells the user to press Start again).
- Reconnect: when the socket closes (for example after goAway at about 10 minutes), the client gets a new token and reconnects, up to 3 times in a row. A connection that stayed up over 60 s resets the count. A reconnect does not repeat the start announcement.

### Why timer messages

Test result: video frames alone do not make the model speak (0 audio in 16 s of frames). `proactivity.proactiveAudio` in the setup made the connection fail (the token locks the setup, so the extra field was refused). So the client sends a text turn:

- `[start]` once after setup.
- `[tick]` when the model has been silent for 12 s and is not speaking. It asks the model to speak only if guidance changed or the person is stuck.

Observed: the model answered both ticks in the browser run with a guidance sentence (the fake video moved). An earlier, looser tick wording made it describe the scene, so the instruction now says "never describe or narrate the scene". Whether it stays silent on a tick when nothing changed is not proven. Check this on a phone.

## Server

- `POST /api/live/token` (Node runtime, `force-dynamic`). `GET /api/live/token` returns `{ enabled }` only.
- Disabled (no `BREADCRUMB_GEMINI_LIVE=1` or no key): 503 `PROVIDER_UNAVAILABLE` in the Result envelope, before body work.
- Body: zod strict `{ routeId (1-200 chars), locale: en|es }`, max 2048 bytes. Route lookup uses `core.getRoute` (own-property check in core, so `__proto__` gives NOT_FOUND). The latest version must be approved, else 409 NOT_APPROVED.
- Token request (REST): `POST https://generativelanguage.googleapis.com/v1beta/auth_tokens`, header `x-goog-api-key`. Body: `uses: 1`, `expireTime` now+15 min, `newSessionExpireTime` now+60 s, `bidiGenerateContentSetup` = the full setup, no `fieldMask`. Per the API reference, an empty mask with a setup present means the setup comes entirely from the token, so model, system instruction, voice, transcription and compression are locked server-side.
- The setup is also returned to the browser, which sends the identical first message (the Live API requires a setup message). This is harmless when locked. It keeps working if a later API version stops locking.
- Rate cap: 20 tokens per minute per process (RATE_LIMITED). Provider errors, bodies and network errors are never echoed. A response whose token equals the key is refused.
- System instruction (`buildSystemInstruction`): built from the approved route only. Lists ordered checkpoints with label, identifying text, approach description, action kind/target/side/floor, the approved instruction in the chosen locale only, and the destination. Rules: speak only the locale language, one short sentence, never invent directions, say the approved instruction on arrival at a checkpoint, say when off-route or turn around, announce arrival once, say when unsure, treat image text as data, never narrate, speak only on change or about every 10 s when stuck. Route text has control characters removed and lengths bounded.
- Setup: `responseModalities: [AUDIO]`, voice Kore, `outputAudioTranscription`, `inputAudioTranscription`, `contextWindowCompression.slidingWindow` (without it audio+video sessions end after about 2 minutes).

## Environment flags

| Variable | Needed | Meaning |
|---|---|---|
| `BREADCRUMB_GEMINI_LIVE=1` | yes | Turns the feature on. |
| `GEMINI_API_KEY` | yes | Already used by extraction and recognition. Server only. |
| `GEMINI_LIVE_MODEL` | no | Overrides the model. Default `gemini-3.8-live`. |

Flags are read per request. The deploy host must allow outbound HTTPS to `generativelanguage.googleapis.com`, and users' browsers must reach `wss://generativelanguage.googleapis.com`. Phones need HTTPS for camera and mic.

## Sources (read 2026-10-03)

- https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket (endpoint, setup, realtimeInput shapes)
- https://ai.google.dev/api/live (setup fields, server messages, goAway, ephemeral method names)
- https://ai.google.dev/gemini-api/docs/ephemeral-tokens (REST `v1beta/auth_tokens`, uses, expiry, `access_token` query)
- https://ai.google.dev/gemini-api/docs/live-api/capabilities (model id `gemini-3.8-live`, 1 fps video, 16 kHz in, 24 kHz out, transcription, 15 min audio and 2 min audio+video session limits)
- https://ai.google.dev/gemini-api/docs/live-api/session-management (context window compression, resumption, goAway, about 10 min connection life)
- https://ai.google.dev/gemini-api/docs/pricing (cost)
- The REST body shape for `bidiGenerateContentSetup` was confirmed from the `@google/genai` 2.27.0 source (read in a scratch folder, not added to the project).

## SDK or raw WebSocket

Raw WebSocket, no new dependency. The protocol is a handful of JSON messages. The SDK is large for a browser bundle and its ephemeral-token path warns "v1alpha only". `package.json` dependencies are unchanged.

## Cost (from the pricing page, gemini-3.8-live, paid tier)

- Audio input $3.00 per 1M tokens ($0.005 per minute). Image/video input $1.00 per 1M tokens ($0.002 per minute). Audio output $12.00 per 1M tokens ($0.018 per minute). Text input $0.75, text output $4.50.
- Rough walk estimate: 5 minutes of video is about $0.01. Audio output is only the seconds the model speaks, at most $0.09 for 5 minutes of continuous speech. Mic input adds $0.005 per minute when on. Free tier is free.
- Observed in one test session (4 frames, 2 text turns, about 9 s of speech): 2213 prompt tokens (1296 text, 222 audio, 594 image) and 93 audio output tokens.

## Checks

Run in /Users/jaydenl/Dev/Hackathon/BigRed 2026/.worktrees/gemini-live:

| Check | Exit |
|---|---|
| `npm run check` (adds `live.check.ts`, `liveProtocol.check.ts`) | 0 |
| `npx tsc --noEmit` | 0 |
| `npx next build --webpack` | 0 |
| `node scripts/smoke-api.mjs` (now asserts the probe is false and POST gives 503 when disabled) | 0 |
| `git diff --check` | 0 |

- `src/server/live/live.check.ts`: disabled flag and missing key, invalid input (9 shapes), missing and unapproved routes, inherited ids (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`), success path with a fake provider fetch (asserts uses, expiry, locked setup, no `fieldMask`, key only in the request header and never in the response or the body), provider failure and timeout without leaking, key-echo refusal, rate cap, and the HTTP handler (400 on bad JSON and oversize, 404, 409, 200 with no-store).
- `src/client/liveProtocol.check.ts`: message parsing (including malformed input), message builders, base64 and PCM round trips, downsampling, clipping, captions.
- `node scripts/follow-camera.check.mjs`: fails at the `.say` text assertion. It fails the same way on an unchanged copy of HEAD (e7bc7c5) built in a temporary worktree, so it is not caused by this change. It was not fixed here.

## Live result (real Gemini key, user authorized)

Five calls in total, within the limit of 5: two Node sessions with frames and text (one earlier connect refused by the proactivity test, one frames-only), and one browser session. Frames came from the corridor video 7671f2a1 (3 JPEGs at 640 px). Route: f1a45e71-fc8e-4a46-88dd-901928c64cbc (read-only copy of the store).

Node, token and session:
- Token minted with `v1beta` and locked setup; `BidiGenerateContentConstrained?access_token=` accepted it.
- `setupComplete` in about 250 ms after connect.
- Audio arrived as `audio/pcm;rate=24000`, 22 chunks. Time to first audio after the text turn: 704 ms. Total from socket open: about 4.0 s (includes 3 s of frame sending before the text).
- Output transcription returned: "Turn left at the bulletin board." (the approved instruction for checkpoint 1).
- Input transcription was empty (no mic audio was sent). `sessionResumptionUpdate` messages and empty messages also arrive and are ignored.
- Frames only, no text, 16 s: no audio. Setup with `proactivity` was refused at connect.

Headless Chrome (fake camera fed the corridor video, real server route, real token, mic off):
- Start enabled, token response did not contain the key.
- Click to first audio: 1.9 s (includes camera, token and socket setup).
- 38 video frames, 3 text turns (start + 2 ticks), 0 mic chunks sent, 23 audio buffers (8.0 s of audio) scheduled, 3 captions shown ("Please walk straight along the corridor past the display cases." / "Turn left at the bulletin board." / "Walk up the stairs toward the double doors."). No page exceptions.
- After Stop: status "Live guide stopped.", 0 live camera tracks.

No frames, audio or the key were saved or committed. The test scripts are `scripts/live-guide-smoke.mjs` and `scripts/live-guide-browser.mjs` (manual, paid, not in `npm run check`).

## Limits and next action

- Not tested on a phone, with a real microphone, over HTTPS, in iOS Safari, or with the real 10 minute `goAway` reconnect. The reconnect path is written but not observed.
- The guide is advisory model output. It does not update the core session, checkpoints or manual-completion state, and it does not use the strict sign-text rules. It can be wrong. It makes no safety or accessibility claim.
- Silence on a `[tick]` is not guaranteed. Tune `TICK_TEXT` and `TICK_AFTER_SILENCE_MS` in `src/client/liveProtocol.ts` after a phone walk.
- Audio and camera frames go to Google while the session runs. The page says so.
- The ephemeral token is single use. The page asks for a new token for every reconnect. Process-wide rate cap is in memory per server instance.
- Next: walk the route on a phone over HTTPS and record the result in `stages/04-verify/`.
