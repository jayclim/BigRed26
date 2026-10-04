# Gemini draft extraction: slice 2b-1

Status: implemented, fixture-checked, host-checked and review-approved, 2026-10-03. PR #7, branch `feat/gemini-extraction`. This deadline repair starts from `77f4aeaf6d49f8623b8c6768b8a3dc033cae9f86`. Host checks on the deadline repair head `d68831467a7be4d49e097b49abb804bcf9cdf208` passed and CI run 37120231568 passed (see Observed checks). Real Gemini model access, provider schema acceptance and real-footage extraction remain **UNVERIFIED** for the earlier slices. The File API slice below has one live check.

## Files API for large videos (2026-10-04, branch `fix/gemini-file-api`)

Problem: a 15.8 MB `.mov` failed with "Gemini inline requests must be smaller than 20 MB". Base64 adds about 33 percent, so a 15 MB video is about 20 MB on the wire. The app media limit (100 MiB) is unchanged.

Behavior:

- The adapter computes the exact inline request size (JSON skeleton plus `ceil(bytes / 3) * 4`) before it builds any base64. Under 20,000,000 bytes, the old single-call inline request is used. At or over it, the Files API path is used. Inline is kept for small videos because it needs one call and no cleanup. The Files API path is the documented route for requests over 20 MB.
- Files API path: (1) `POST https://generativelanguage.googleapis.com/upload/v1beta/files` with `x-goog-api-key`, `x-goog-upload-protocol: resumable`, `x-goog-upload-command: start`, `x-goog-upload-header-content-length`, `x-goog-upload-header-content-type` and a JSON `file.display_name` body. (2) `POST` the bytes to the `x-goog-upload-url` response header with `x-goog-upload-offset: 0` and `x-goog-upload-command: upload, finalize`. The API key is not sent to the session URL. The URL must start with the Gemini origin. (3) Poll `GET /v1beta/files/{id}` until `state` is `ACTIVE`. `FAILED` returns non-retryable `INVALID_INPUT`. (4) `POST /v1beta/interactions` with `input: [{type:'text'}, {type:'video', uri, mime_type}]`; no inline data. (5) In `finally`, `DELETE /v1beta/files/{id}` with its own 5 s deadline. A failed delete is ignored (files also expire after 48 hours).
- Polling is bounded twice: by `filePollLimitMs` (default 120 s, retryable "still processing" error) and by the request signal. The sleep between polls is abortable.
- Default request deadline in `extractDraft` is now `DEFAULT_EXTRACTION_TIMEOUT_MS` = 180 s (was 60 s). One deadline still covers read, upload, wait, generate and body reads. Reason: a 100 MiB upload plus processing can exceed 60 s. Callers can still pass `timeoutMs`. **Lead decision point:** the route passes no `timeoutMs`.
- The up-front metadata rejection for sizes at or over 20 MB is removed. The stored-size match check remains.
- HTTP error mapping (status only, provider body never read or echoed): 400 or 413 returns `INVALID_INPUT`, not retryable. 401 or 403 returns `PROVIDER_UNAVAILABLE`, not retryable. 429, 5xx, a missing or foreign session URL and bad JSON return retryable `PROVIDER_UNAVAILABLE`.
- Unchanged: env gate, 1,000,000-byte response bound, Zod validation, draft-only save, `Result` envelopes.

Live check found a second defect, independent of file size. Gemini returned HTTP 400 "Request contains an invalid argument" for the full draft schema, even for a text-only request. Bisect with text-only probes: removing only `minItems` and `maxItems` gives HTTP 200; removing only `minimum`, only string lengths, only `additionalProperties` or only `$schema` still gives 400. The adapter now sends `providerJsonSchema` (the Zod JSON schema without `minItems` and `maxItems`). Zod still enforces the bounds on the response. `draftJsonSchema` is unchanged.

Doc sources read on 2026-10-04 (WebFetch; the docs mark the Interactions API as the current API):

- https://ai.google.dev/gemini-api/docs/files : resumable upload headers, `files.get`, `files.delete`, 2 GB per file, 48 hour retention, Files API for requests over the inline limit.
- https://ai.google.dev/gemini-api/docs/video-understanding : full REST example with upload, `ACTIVE` polling loop and `{"type": "video", "uri": ..., "mime_type": ...}` in an Interactions request; says to use the Files API when the request is over 20 MB.
- https://ai.google.dev/gemini-api/docs/file-input-methods : `{"type":"document","uri":...,"mime_type":...}` input shape (same pattern).
- https://ai.google.dev/api/files : File resource fields (`name`, `uri`, `state`, `error`), states `PROCESSING`, `ACTIVE`, `FAILED`, `get` and `delete` endpoints, media upload URL.
- The Interactions overview page has no video-by-uri example; the video guide is the source for that shape. The file `state` is not documented on the Files guide page, only on the API reference.

Checks (worktree, Node 24.11.1, 2026-10-04):

- `node src/server/extraction/extraction.check.ts`: exit 0, 50 cases (32 earlier; the 20 MB metadata case now expects the size-mismatch error; the encoded-size adapter case was replaced by Files API cases). New fake-fetch cases: just-under-limit stays inline; large video call sequence (start, finalize, 3 polls PROCESSING to ACTIVE, interactions by uri with no inline data, delete) with header assertions and no API key on the session URL; end-to-end `extractDraft` with a stored 15 MB file; `FAILED` state; poll limit; request deadline during polling stops polling and still deletes; HTTP 400, 403, 429, 503 on start; 413, 500 on finalize; missing and foreign session URL; poll HTTP error; interactions 429; delete returning 500 or throwing; provider schema has no `minItems` or `maxItems`.
- `npm run check`: exit 0. `npx tsc --noEmit`: exit 0. `npx next build --webpack`: exit 0. `git diff --check`: exit 0.
- Live check (user authorized, paid key from `.env.local`, default model `gemini-3.8-flash`, adapter called directly, in-memory save, no video or result copied into Git): stored 15,799,254 byte `video/quicktime` file. Attempt 1 and 2 (before the schema fix): upload 200, finalize 200, poll 200, interactions 400, delete 200. Attempt 3: interactions 503 "high demand" (provider, retryable), delete 200. Attempt 4: upload start 200 (0.3 s), finalize 200 (1.1 s), poll 200 (ACTIVE on the first poll), interactions 200 (19.5 s), delete 200 (0.3 s); `ok: true`, status `draft`, 5 checkpoints, 1 destination, 25.5 s total. The key is on the Free Tier (5 requests per minute); a few schema probes also ran before attempt 4.

Limits: one video, one model, one run. Footage content quality of the 5 checkpoints was not reviewed. An abort during the finalize upload can leave an orphan file until its 48 hour expiry. The 15 MB to 100 MiB range was not tested above 15.8 MB; a 100 MiB upload within 180 s depends on bandwidth. Files API storage is a Google-side copy of the user's video for the request duration. The `minItems`/`maxItems` cause was found for this schema; the exact keyword (min or max, which path) was not isolated.

## Behavior and repair

`POST /api/media/:id/extract` requires both `BREADCRUMB_GEMINI_EXTRACTION=1` and a key. It reads stored media, validates the provider draft and saves a new unapproved version-1 route through `core.saveDraft`. Exactly one destination must be last. Null actions are omitted; present actions and literal sign text are preserved. Access notes stay empty. Human review is still required.

The repair changes only the extraction module, its fixtures and this receipt:

- A native stream reader counts provider response bytes. `MAX_PROVIDER_RESPONSE_BYTES` is 1,000,000. Overflow cancels the reader before full buffering, decoding or JSON parsing. Missing bodies, read failures and invalid envelope JSON return a sanitized retryable `PROVIDER_UNAVAILABLE` error without saving.
- The existing request signal and deadline cancel a stalled body read. Cancellation does not await the source's cleanup promise. Reader locks and abort listeners are released. The existing cancellation/timeout message is preserved.
- Media lookup no longer calls uncancellable `stat()`. It reads with the request signal, then compares the returned byte count with metadata. A mismatch returns the existing sanitized media error with no provider call or save. UUID, identity, MIME and fixed-extension checks remain. The adapter still checks the full encoded request size before fetch.
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

Evidence remains fixture-only. Synthetic video headers are not playable footage. Literal text preservation does not prove the text was visible. The conservative encoded request limit remains under 20 MB; a valid provider envelope over 1 MB is rejected. Local media and core persistence remain single-process filesystem storage. The File API is covered in its own section above. There is no provider retry loop, UI or billing integration in this slice.

Nonblocking residual under trusted single-process storage: there is no byte bound during a local media read. A file much larger than its metadata can be read fully before the mismatch check. The deadline now covers metadata read, media read and generate, as shown by the fixtures above. This does not establish a memory bound for a local metadata/byte mismatch.

Next: lead review of slice 2b-2 creator extraction UI and host build/browser checks; see [creator-extraction.md](creator-extraction.md). Real Gemini model access, schema acceptance and real-footage extraction need a later authorized live check.

## Final review

2026-10-03, lead session 7a1270e0: a fresh read-only [SOL] review (gpt-6.1-sol, native `codex:codex-rescue`, agent a551e98d8f34c2af7) of `77f4aea..d688314` found no blockers. It ran the four metadata/media never/late cases in memory on Node 24.11.1: each returned the sanitized timeout in 22-23 ms with zero generate and save calls. The baseline source failed all four at the 150 ms watchdog. Listener cleanup held on early returns, errors, success and already-aborted entry; late generate settlement saved nothing; no unhandled rejections. Residual (non-blocking): a metadata/media size mismatch has no extra byte bound beyond the raw limit under trusted local single-process storage.

Limits: no live Gemini call, no real footage, model/account access and provider schema acceptance remain **UNVERIFIED**. Next: 2b-2 creator review/edit UI, then 2b-3 the first allowed live call after budget confirmation.
