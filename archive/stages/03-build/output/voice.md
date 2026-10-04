# Part C, PR 1: voice adapter

Status: implemented; host-verified with fake providers and a generated test clip. Date: 2026-10-03.
Branch: `feat/voice-adapter`. Base: `5c4f790ca3f13aaba4fdb5b248bda8288465a4fd`.
Implementer: one [SOL] worker (`gpt-6.1-sol`) through the official Codex plugin. The Claude lead ran the host checks. No live provider call or reset command was made.

## Behavior

`httpVoice` implements the frozen VoiceAdapter. It sends SpeechRequest JSON to POST `/api/speech`. Network and non-JSON errors use the same mapping as httpCore. The voice module does not import session or navigation code. Handlers reuse only the stateless `respond` helper.

Text is passed unchanged. Reject blank text, text over 500 JavaScript string units, unknown fields, locale other than en/es, voice token other than `default`, and invalid instructionId. The instructionId must be nonblank, contain no control characters and have at most 200 string units. It remains opaque. Request bodies have an 8,192-byte cap. Both Content-Length and bytes read are checked before JSON parsing.

The server maps `default` to ELEVENLABS_VOICE_ID, or the documented George voice ID `JBFqnCBsd6RMkjVDRZzb`. Credentials require both BREADCRUMB_ELEVENLABS_VOICE set to `1` and ELEVENLABS_API_KEY. Disabled or missing credentials return nonretryable PROVIDER_UNAVAILABLE on a cache miss. A valid existing cache entry can be used while synthesis is disabled.

Provider: POST `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, with `xi-api-key`, JSON `text` and `model_id: eleven_multilingual_v2`. Locale is checked and included in the cache key. This model detects language from text; no unsupported language_code is sent. Sources inspected on 2026-10-03: [official REST reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [official quickstart](https://elevenlabs.io/docs/eleven-api/quickstart), [model reference](https://elevenlabs.io/docs/overview/models). Endpoint, model and account access are UNVERIFIED LIVE.

The provider deadline is 15 seconds. It covers fetch and the full audio body read. A deadline race also bounds injected providers that ignore AbortSignal. Timeout returns retryable PROVIDER_UNAVAILABLE. HTTP 429 returns retryable RATE_LIMITED. Other provider failures return retryable PROVIDER_UNAVAILABLE. Provider bodies and keys are never returned or logged. Unread bodies are cancelled without waiting for source cleanup.

Audio has a 2,000,000-byte cap. The real provider requires audio/mpeg and an MP3 header. Local cache files also accept WAV with RIFF/WAVE headers for the generated test tone. These checks are header checks, not codec decoding.

Cache ID is SHA-256 of JSON `[exact text, locale, provider voice ID]`. instructionId is excluded. Cache files live in BREADCRUMB_VOICE_DIR, or `voice` beside BREADCRUMB_DATA_FILE (normally `.data/voice`). Each file is a MIME line, newline, then audio bytes. A unique temporary file and rename publish one complete entry. A failure removes the temporary file. In-process requests for the same key share one operation. A disk hit sets cached=true; callers sharing a new synthesis receive cached=false.

GET `/api/speech/{id}` accepts exactly 64 lowercase hex characters. It returns audio bytes with Content-Type, Content-Length, private/no-store and nosniff. Unknown IDs return 404 Result; malformed IDs return 400 Result. Returned audioUrl is a same-origin relative path. It contains no provider URL or credential.

## Files

- `src/server/voice/voice.ts`: validation, provider, deadline, cache and bounded body reader.
- `src/server/voice/voice.check.ts`: offline tests, stubbed fetch and direct route handler checks.
- `src/app/api/speech/route.ts`: POST handler.
- `src/app/api/speech/[id]/route.ts`: audio GET handler; awaits Next.js 16 params.
- `src/client/voice.ts`: exported httpVoice.
- `scripts/voice-fixture.mjs`: generated WAV tone, isolated store and provider-disabled child environment.
- `scripts/voice-smoke.mjs`: production HTTP validation and seeded audio tests.
- `scripts/voice-harness.mjs`: local browser page, same-origin API proxy and --once HTTP check.
- `stages/03-build/output/voice.md`: this receipt.

The harness uses ports 3119 and 3120. The smoke uses port 3118 by default, or its numeric first argument. Both need a successful build first. The page shows “TEST CLIP - generated tone, not ElevenLabs”. Play calls POST and then new Audio(audioUrl). It shows playback started, completed or failed. Ctrl+C stops its child and removes its own temporary directories. --once checks HTTP through the page proxy; it does not prove browser playback.

## Observed commands

Host: Windows 11, Node 24.21.0, after `npm ci` from the existing lockfile. Run by the Claude lead on 2026-10-03.

- `node src/server/voice/voice.check.ts`: PASS, "voice checks passed (46 cases; no network calls)". Covers exact text, cache hit/miss, locale and provider voice isolation, concurrent dedupe, invalid text/locale/token/instructionId, missing credentials, timeout, 429, non-OK body privacy/cancellation, invalid/empty/oversized audio rejected before any cache write, ElevenLabs request shape through stubbed fetch, httpVoice error mapping, direct POST 200/400/503, direct GET 200/400/404 and oversized streamed bodies.
- `npm run check`: PASS (core, media, extraction 32 cases).
- `npm run typecheck`: PASS.
- `npm run build`: PASS. Routes include `ƒ /api/speech` and `ƒ /api/speech/[id]`.
- `node scripts/voice-smoke.mjs`: PASS. Eight invalid bodies return 400 INVALID_INPUT, nonretryable. An uncached request with voice disabled returns 503 PROVIDER_UNAVAILABLE, nonretryable. An oversized streamed body with no Content-Length returns 400. The seeded clip returns 200 `cached:true`; GET returns the same bytes as `audio/wav`. Bad and unknown audio IDs return 400 and 404.
- `node scripts/voice-harness.mjs --once`: PASS, "HTTP only; browser playback unverified".
- `node scripts/smoke-api.mjs`: FAIL on this Windows host, `spawn node_modules/.bin/next ENOENT`. The shared `scripts/isolated-server.mjs` spawns the POSIX launcher. This script and helper are unchanged on this branch, so the failure exists on main too. The voice fixture has a local Windows launcher.

Browser harness, Chrome through Claude in Chrome: the page showed "TEST CLIP - generated tone, not ElevenLabs". Play sent POST `/api/speech` (200). In the page, GET of `audioUrl` returned 200 `audio/wav`, 16,044 bytes. `OfflineAudioContext.decodeAudioData` decoded it as 0.5 s, 16 kHz, mono. The `<audio>` element stayed at readyState 0 because the automated tab reported `visibilityState: hidden`, and Chrome defers media there. Audible playback is NOT observed. A person must open the harness in a visible tab and click Play. Superseded: the user later reported hearing the generated tone in a visible tab (2026-10-03). That is a user report of generated-tone playback only; see [the verify receipt](../../04-verify/output/voice.md).

This evidence is transport and decode only, with a generated tone. It is not ElevenLabs audio.

## Integration instructions

1. Fix the shared `scripts/isolated-server.mjs` Windows launcher: spawn `process.execPath` with `node_modules/next/dist/bin/next`. Then `node scripts/smoke-api.mjs` can run on Windows. The voice fixture has a small local Windows adaptation; other platforms reuse isolated-server.mjs.
2. After the B voice consumer PR merges, import httpVoice into the client mount and wire `voice={httpVoice}`. Do not change required GuideScreen props or import an unmerged branch.
3. Add `node src/server/voice/voice.check.ts` to the shared check script. Add `node scripts/voice-smoke.mjs` to CI after build. Review the exact diff before integration.
4. Add server-only .env.example entries for BREADCRUMB_ELEVENLABS_VOICE (disabled by default), ELEVENLABS_API_KEY (blank), ELEVENLABS_VOICE_ID (optional), and BREADCRUMB_VOICE_DIR (optional). BREADCRUMB_DATA_FILE already defines the default data location. Never use NEXT_PUBLIC for credentials.
5. Superseded: the user reported hearing the generated tone in the harness in a visible tab. See [the verify receipt](../../04-verify/output/voice.md). Rerun the harness only after a change to delivery. Keep generated tone evidence separate from real ElevenLabs evidence.

## Independent review

A fresh [SOL] review (`gpt-6.1-sol`, official Codex plugin) checked exact head `b4ba8a2` on 2026-10-03. Verdict: no blocking defect. It confirmed contract and httpCore mapping, unchanged text, no path traversal in GET IDs, no key or provider-body exposure, a full deadline, correct 429 and missing-credential codes, and owned paths only. Its sandbox had Node 22.15, so it could not rerun the runtime checks; `npm.cmd run typecheck` passed there.

Non-blocking findings, not fixed in this PR:

- Medium: distinct texts start independent provider calls with no total limit. Each call can hold up to 2 MB. Add an admission limit that returns retryable RATE_LIMITED before enabled synthesis is used outside controlled local tests.
- Low: the checks do not inject write or rename failures. Temp-file cleanup after a failed write is in the code (`finally` removes the temp file) but is not tested.

## Limits and next action

No live ElevenLabs call was made. Endpoint/model acceptance, live English/Spanish audio and phone audio are unverified. Audible playback of the generated tone rests on a user report, not automated evidence. No guide mount or navigation state changed. The pre-existing untracked `.vscode/` directory was left unchanged. No shared source or config was edited.

The cache has a per-entry audio bound but no total size cap, TTL or eviction. Clear only an explicitly selected voice cache directory when required. Deduplication is for one Node process; there is no distributed lock. Do not use this local disk design as a claim of serverless durability. Changing model settings would need cache invalidation; this slice uses one fixed model. Audio checks do not decode codecs, test seeking or implement HTTP Range delivery.

Next action: superseded by the user report of generated-tone playback ([verify receipt](../../04-verify/output/voice.md)). Make a separate live English/Spanish test only after spending caps are confirmed. Verify audio on the target phone before claiming the physical audio gate.
