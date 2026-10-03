# Gemini draft extraction: slice 2b-1

Status: implemented and fixture-checked, 2026-10-03. PR #7, branch `feat/gemini-extraction`. This repair starts from `ea6d1de18cb10bf53bc2f1dbf43812030b1d8422`. Repair host checks passed (see Checks). Real Gemini model access, provider schema acceptance and real-footage extraction remain **UNVERIFIED**.

## Behavior and repair

`POST /api/media/:id/extract` requires both `BREADCRUMB_GEMINI_EXTRACTION=1` and a key. It reads stored media, validates the provider draft and saves a new unapproved version-1 route through `core.saveDraft`. Exactly one destination must be last. Null actions are omitted; present actions and literal sign text are preserved. Access notes stay empty. Human review is still required.

The repair changes only the extraction module, its fixtures and this receipt:

- A native stream reader counts provider response bytes. `MAX_PROVIDER_RESPONSE_BYTES` is 1,000,000. Overflow cancels the reader before full buffering, decoding or JSON parsing. Missing bodies, read failures and invalid envelope JSON return a sanitized retryable `PROVIDER_UNAVAILABLE` error without saving.
- The existing request signal and deadline cancel a stalled body read. Cancellation does not await the source's cleanup promise. Reader locks and abort listeners are released. The existing cancellation/timeout message is preserved.
- Media lookup no longer calls uncancellable `stat()`. It checks the stored size against the 20,000,000-byte raw limit, reads with the request signal, then compares the returned byte count with metadata. A mismatch returns the existing sanitized media error with no provider call or save. UUID, identity, MIME and fixed-extension checks remain. The adapter still checks the full encoded request size before fetch.

## Observed checks

Worker checks on 2026-10-03 used Node 24.11.1, fixture configuration, stubbed fetch and an in-memory core. No live fetch or provider call was made. No environment files or credentials were read.

- `node src/server/extraction/extraction.check.ts`: **PASS**, 28 cases. New cases cover a valid padded envelope streamed in chunks, source cancellation on overflow, missing body, invalid envelope JSON, caller abort and timeout during a stalled read, media byte mismatch and metadata size precheck. They assert sanitized errors and no saves. The mismatch also asserts zero fetches. Stalled reads must finish within a one-second guard, even when source cancellation never finishes.
- `npm run check`: **PASS**, core, media and all 28 extraction cases.
- `npm run typecheck`: **PASS**.
- `git diff --check`: **PASS**.
- Repair host checks (Claude lead, 2026-10-03): `npm run check`, `npm run typecheck`, `npm run build` and `node scripts/smoke-api.mjs` passed on the repair diff.

Baseline host evidence reported by lead `536b9397`: check, typecheck, build and HTTP smoke passed at `ea6d1de`. This supersedes the earlier worker-sandbox build and commit failures. These baseline passes do not verify the repair. This worker did not stage, commit, push or change Git configuration.

## References and limits

The earlier slice read the public [video](https://ai.google.dev/gemini-api/docs/video-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [models](https://ai.google.dev/gemini-api/docs/models), [Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview) and [REST reference](https://ai.google.dev/api/interactions-api) pages on 2026-10-03. This repair did not refresh them. The adapter retains the `/v1beta/interactions` endpoint, `store: false`, generated Zod JSON schema and default `gemini-3.8-flash` model. The installed Next.js route guide was read for this repair.

Evidence remains fixture-only. Synthetic video headers are not playable footage. Literal text preservation does not prove the text was visible. The conservative encoded request limit remains under 20 MB; a valid provider envelope over 1 MB is rejected. Local media and core persistence remain single-process filesystem storage. There is no File API support, provider retry loop, UI or billing integration in this slice.

Limit: the media read is bounded by the deadline, not by size; a local file much larger than its metadata is read fully before the mismatch check.

Next: request a fresh focused review of the repair delta. Real Gemini model access, schema acceptance and real-footage extraction need a later authorized live check.
