# Gemini draft extraction: slice 2b-1

Status: implemented, fixture-checked, host-checked and review-approved, 2026-10-03. PR #7, branch `feat/gemini-extraction`. This deadline repair starts from `77f4aeaf6d49f8623b8c6768b8a3dc033cae9f86`. Host checks on the deadline repair head `d68831467a7be4d49e097b49abb804bcf9cdf208` passed and CI run 37120231568 passed (see Observed checks). Real Gemini model access, provider schema acceptance and real-footage extraction remain **UNVERIFIED**.

## Behavior and repair

`POST /api/media/:id/extract` requires both `BREADCRUMB_GEMINI_EXTRACTION=1` and a key. It reads stored media, validates the provider draft and saves a new unapproved version-1 route through `core.saveDraft`. Exactly one destination must be last. Null actions are omitted; present actions and literal sign text are preserved. Access notes stay empty. Human review is still required.

The repair changes only the extraction module, its fixtures and this receipt:

- A native stream reader counts provider response bytes. `MAX_PROVIDER_RESPONSE_BYTES` is 1,000,000. Overflow cancels the reader before full buffering, decoding or JSON parsing. Missing bodies, read failures and invalid envelope JSON return a sanitized retryable `PROVIDER_UNAVAILABLE` error without saving.
- The existing request signal and deadline cancel a stalled body read. Cancellation does not await the source's cleanup promise. Reader locks and abort listeners are released. The existing cancellation/timeout message is preserved.
- Media lookup no longer calls uncancellable `stat()`. It checks the stored size against the 20,000,000-byte raw limit, reads with the request signal, then compares the returned byte count with metadata. A mismatch returns the existing sanitized media error with no provider call or save. UUID, identity, MIME and fixed-extension checks remain. The adapter still checks the full encoded request size before fetch.
- The earlier deadline claim was incorrect: metadata and media `readFile` awaits were outside the cancellation race. One cancellation promise is now created before the first read. The metadata read, media read and generate each race against it. Abort guards follow all three races. A `finally` covering reads and generate removes the listener. The optional `deps.readFile` fixture seam defaults to Node `readFile`. Stalled or late reads cannot reach generate or save. Response byte caps, overflow handling and reader cleanup are unchanged by this deadline repair.

## Observed checks

Worker checks on 2026-10-03 used Node 24.11.1, fixture configuration, stubbed fetch and an in-memory core. No live fetch or provider call was made. No environment files or credentials were read.

- Before the cancellation-race fix, the new metadata fixture reproduced the defect: exit 1, `Error: metadata never read exceeded the 150 ms deadline guard` with `timeoutMs: 20`.
- `node src/server/extraction/extraction.check.ts`: **PASS**, exit 0, `extraction checks passed (32 cases; no network calls)`.
- `npm run check`: **PASS**, exit 0. Core and media checks passed; extraction reported `extraction checks passed (32 cases; no network calls)`.
- `npm run typecheck`: **PASS**, exit 0 (`tsc --noEmit`, no diagnostics). The first run reported TS7006 for the injected read's parameters; explicit parameter types fixed it before the passing run.
- `git diff --check`: **PASS**, exit 0, no output.
- Temporary-directory filesystem access worked. No sandbox filesystem block occurred.
- Deadline repair host checks (Claude lead, 2026-10-03): `npm run check` (32 extraction cases), `npm run typecheck`, `npm run build` and `node scripts/smoke-api.mjs` (`smoke passed`) passed on this diff.

New fixtures use a read that ignores its signal. All use `timeoutMs: 20`, a measured elapsed-time assertion under 150 ms and a 150 ms watchdog. Each returns the exact sanitized retryable `PROVIDER_UNAVAILABLE` cancellation message. All assert zero generate and save calls. Late fixtures resolve the pending read after the timeout result, then recheck zero calls and no further reads after an event-loop turn.

| Fixture | Standalone check | `npm run check` |
|---|---|---|
| `metadata never read` | 22.3 ms | 22.3 ms |
| `metadata late read` | 22.3 ms | 22.2 ms |
| `media never read` | 22.3 ms | 21.9 ms |
| `media late read` | 22.7 ms | 20.4 ms |

The media fixtures let metadata resolve before stalling the media read. The existing signal-ignoring generate fixture (`timeoutMs: 10`) also passes. These checks establish deadline coverage for metadata, media and generate in the injected cases. Existing response overflow, stalled body cancellation, media mismatch and encoded-size fixtures pass within the same 32-case suite.

Earlier response-reader repair host checks (Claude lead, 2026-10-03): `npm run check`, `npm run typecheck`, `npm run build` and `node scripts/smoke-api.mjs` passed before this deadline repair. They do not verify the current delta.

Baseline host evidence reported by lead `536b9397`: check, typecheck, build and HTTP smoke passed at `ea6d1de`. This supersedes the earlier worker-sandbox build and commit failures. These baseline passes do not verify the repair. This worker did not stage, commit, push or change Git configuration.

## References and limits

The earlier slice read the public [video](https://ai.google.dev/gemini-api/docs/video-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [models](https://ai.google.dev/gemini-api/docs/models), [Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview) and [REST reference](https://ai.google.dev/api/interactions-api) pages on 2026-10-03. This repair did not refresh them. The adapter retains the `/v1beta/interactions` endpoint, `store: false`, generated Zod JSON schema and default `gemini-3.8-flash` model. The installed Next.js route guide was read for this repair.

Evidence remains fixture-only. Synthetic video headers are not playable footage. Literal text preservation does not prove the text was visible. The conservative encoded request limit remains under 20 MB; a valid provider envelope over 1 MB is rejected. Local media and core persistence remain single-process filesystem storage. There is no File API support, provider retry loop, UI or billing integration in this slice.

Nonblocking residual under trusted single-process storage: there is no byte bound during a local media read. A file much larger than its metadata can be read fully before the mismatch check. The deadline now covers metadata read, media read and generate, as shown by the fixtures above. This does not establish a memory bound for a local metadata/byte mismatch.

Next: lead review of slice 2b-2 creator extraction UI and host build/browser checks; see [creator-extraction.md](creator-extraction.md). Real Gemini model access, schema acceptance and real-footage extraction need a later authorized live check.

## Final review

2026-10-03, lead session 7a1270e0: a fresh read-only [SOL] review (gpt-6.1-sol, native `codex:codex-rescue`, agent a551e98d8f34c2af7) of `77f4aea..d688314` found no blockers. It ran the four metadata/media never/late cases in memory on Node 24.11.1: each returned the sanitized timeout in 22-23 ms with zero generate and save calls. The baseline source failed all four at the 150 ms watchdog. Listener cleanup held on early returns, errors, success and already-aborted entry; late generate settlement saved nothing; no unhandled rejections. Residual (non-blocking): a metadata/media size mismatch has no extra byte bound beyond the raw limit under trusted local single-process storage.

Limits: no live Gemini call, no real footage, model/account access and provider schema acceptance remain **UNVERIFIED**. Next: 2b-2 creator review/edit UI, then 2b-3 the first allowed live call after budget confirmation.
