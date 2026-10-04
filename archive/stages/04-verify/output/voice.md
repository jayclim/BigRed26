# Voice adapter checks

Status: contract match; no blocking defect. Date: 2026-10-03. Reviewer: Cursor, independent of the implementer. PR: [#16](https://github.com/jayclim/BigRed26/pull/16). Branch: `feat/voice-adapter`. Exact head: `c47486e93c32f01a244545a39b7f8acfad479f5f`. Base: `5c4f790`. Build receipt: [voice.md](../../03-build/output/voice.md).

This review checked the Part C assignment in [TEAM-HANDOFF](../../../docs/TEAM-HANDOFF.md) and [THIRD-START](../../../docs/THIRD-START.md) against that head. It did not merge the PR.

## Observed in this review

| Command | Actual result |
|---|---|
| `node src/server/voice/voice.check.ts` | Pass. Exit 0. Printed `voice checks passed (46 cases; no network calls)`. |

Host: Windows. The command used the current checkout of `c47486e`. This review did not rerun `npm run check`, `npm run typecheck`, `npm run build`, `node scripts/voice-smoke.mjs`, `node scripts/voice-harness.mjs`, or `node scripts/smoke-api.mjs`. Those results stay in the build receipt.

Inspected behavior at this head:

- `httpVoice` posts the SpeechRequest unchanged to `POST /api/speech`. Network and non-JSON failures use the same mapping as `httpCore`.
- The server rejects blank text, text over 500 string units, a locale other than `en`/`es`, a voice token other than `default`, a bad `instructionId`, unknown fields, and a body over 8,192 bytes.
- The cache key is exact text, locale, and the server voice id. `instructionId` is excluded. Identical in-flight requests share one synthesis and receive `cached: false`.
- Missing credentials return non-retryable `PROVIDER_UNAVAILABLE`. Timeout returns retryable `PROVIDER_UNAVAILABLE`. HTTP 429 returns retryable `RATE_LIMITED`. Other provider failures return retryable `PROVIDER_UNAVAILABLE`.
- Provider bodies and the API key are not returned. `GET /api/speech/[id]` accepts only 64 lowercase hex characters and serves a same-origin file from the voice directory.
- Changed paths stay inside `src/server/voice/**`, `src/app/api/speech/**`, `src/client/voice.ts`, `scripts/voice-*.mjs`, and `stages/03-build/output/voice.md`. Guide UI, core, contracts, app mounts, shared CSS, and package files are unchanged.

## Findings

No blocking defect.

- Low: a cache file that fails the audio header check blocks that text. `synthesize` calls the provider only after `loadAudio` returns `NOT_FOUND`. Any other cache error is returned as retryable `PROVIDER_UNAVAILABLE`, and the next request hits the same file (`src/server/voice/voice.ts`). A normal write validates the audio, writes a temp file, and renames it into place, so this needs an already truncated or edited file.
- Low: the build receipt still says audible playback was not observed. That sentence matches the hidden automated tab. The user later reported hearing the generated tone. This review did not replay the harness. Treat that report as separate from the automated evidence, and separate from live ElevenLabs audio.

## Recorded limits, still present

The earlier review of `b4ba8a2` left these unfixed. This head does not change them.

- Distinct texts start independent provider calls. Each call can hold up to 2 MB. There is no shared admission limit.
- The checks do not inject write or rename failures.
- A missing key is non-retryable. An HTTP 401 from the provider is retryable `PROVIDER_UNAVAILABLE`.
- CI does not run `node src/server/voice/voice.check.ts` or `node scripts/voice-smoke.mjs`. The assignment leaves that addition to the integration owner.
- `node scripts/smoke-api.mjs` fails on this Windows host because `scripts/isolated-server.mjs` spawns the POSIX Next launcher. The build receipt records the same failure on main. The voice fixture has its own Windows launcher.
- No live ElevenLabs call, phone playback, or guide mount is claimed.

## Next action

The integration owner can use this receipt with the build receipt. Add the voice check and voice smoke to the shared check script and CI before relying on them in merge gates. Keep the generated-tone report separate from a live English/Spanish provider test. Confirm spending caps before that live test.
