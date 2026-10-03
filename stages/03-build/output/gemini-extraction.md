# Gemini draft extraction: slice 2b-1

Status: implemented and fixture-checked, 2026-10-03. Branch: `feat/gemini-extraction`. Base: `26b68a1`. Provider availability: **UNVERIFIED** until an allowed real call. No UI is included.

## Behavior

`POST /api/media/:id/extract` uses Gemini only when both `BREADCRUMB_GEMINI_EXTRACTION=1` and `GEMINI_API_KEY` are set. Otherwise it returns 503 `PROVIDER_UNAVAILABLE` before media lookup. A key alone cannot enable a call.

The extraction module accepts a UUID before it builds a path. It reads the stored JSON metadata and the video extension selected from the existing MIME allowlist. Missing media returns `NOT_FOUND`. A provider fixture or the REST adapter returns a draft. Zod validates bounded fields and 1–50 checkpoints. The provider JSON schema is generated with Zod 4 `z.toJSONSchema`; it is not copied by hand. Exactly one destination must be last. Invalid JSON, invalid fields and destination errors return retryable `PROVIDER_UNAVAILABLE` without saving a route.

Each extraction creates a new route id at version 1 and saves it through `core.saveDraft` with status `draft`. Each checkpoint references the stored media and video time. Destination views use role `destination`; other views use `landmark`. Null actions are omitted. Present actions and literal sign text are preserved. Access notes stay empty. This preserves text returned by the provider; it does not prove that text was visible in real footage. Approval still requires the existing human review step. The module combines the request signal with a 60-second timeout and also bounds injected providers that ignore cancellation. Cancellation returns a retryable error before save.

## Public documentation checked

Read on 2026-10-03. Plain `curl` requests to the three requested `.md.txt` URLs failed with `Could not resolve host: ai.google.dev`. The web reader rejected those URLs because their content type was `text/markdown`. The corresponding public HTML pages were read instead:

- [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding): REST examples use `POST https://generativelanguage.googleapis.com/v1beta/interactions`, `x-goog-api-key`, `model`, and `input` parts. An inline video part has `type: video`, base64 `data`, and `mime_type`. The table says inline data is under 100 MB, but the inline section says under 20 MB total request size. This slice uses the conservative **under 20,000,000 bytes** bound on the full JSON request, including base64 expansion, prompt and schema. Larger files return `INVALID_INPUT` naming the 20 MB limit before fetch. File API upload is deferred.
- [Structured output](https://ai.google.dev/gemini-api/docs/structured-output): JSON output uses `response_format` with `type: text`, `mime_type: application/json`, and `schema`. Local validation still checks the result.
- [Models](https://ai.google.dev/gemini-api/docs/models): `gemini-3.8-flash` is listed as stable. It is the default documented model id. `GEMINI_MODEL` can override it. Account access and runtime success are unverified.
- [Interactions overview](https://ai.google.dev/gemini-api/docs/interactions-overview): Interactions is the current standard interface; it directs existing `generateContent` integrations to migrate. This is why this slice uses the endpoint shown by the current video and structured-output guides. `store: false` requests stateless behavior.
- [REST reference](https://ai.google.dev/api/interactions-api): the chosen `/v1beta/` endpoint is beta, even though the model is stable. A completed response has `status: completed`; final text is in `steps` of type `model_output`, then `content` parts of type `text`. Thoughts are not parsed as draft text. The reference also lists a stable v1 endpoint; this slice follows the guides' v1beta examples. No version fallback is implemented.

The installed Next.js 16.3.8 route guide was read at `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`. Route parameters are promises and are awaited in the handler.

## Local enable steps

First confirm the provider budget and allowed call. Then set `BREADCRUMB_GEMINI_EXTRACTION=1` and `GEMINI_API_KEY` in ignored `.env.local`, and restart the local server. `GEMINI_MODEL` is optional. Upload a supported video small enough for the 20 MB encoded request limit, then POST its media id to the extraction endpoint. Review and edit every checkpoint through the existing approval flow. No billing machinery was added. This worker did not read or print `.env.local`.

## Observed checks

All commands used Node 24.11.1 through the requested PATH. No provider network call was made in any check.

- `npm run check`: passed core and media checks plus 21 extraction cases. Fixtures cover bad id, missing media, all disabled configurations with a throwing fetch stub, provider failure, timeout, caller abort, invalid JSON/schema, multiple/missing/misordered destinations, saved unapproved drafts, action omission/preservation, exact literal text, approval without review, REST request/response fields, inline base64 size and sanitized HTTP errors. Temporary files are removed.
- `npm run typecheck`: passed after fixing media type narrowing.
- `npm run build`: failed before compilation. Turbopack reported `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. The existing symlink was preserved; no package or configuration change was made to work around it.
- `node scripts/smoke-api.mjs`: could not start its isolated server. Exact listener error: `listen EPERM: operation not permitted 0.0.0.0:3107`. No HTTP cases ran. The new case expects disabled extraction to return 503. The child has no inherited Gemini key or model and receives an explicit disabled flag, which overrides local environment file enablement. The host must run build and HTTP smoke.

Git: explicit staging of the nine owned paths was attempted. The sandbox rejected `.git/worktrees/gemini-extraction/index.lock` with `Operation not permitted`. No commit was created and no push was attempted. The host must commit the owned paths with message `Add Gemini draft extraction foundation`. The pre-existing untracked `node_modules` symlink remains unchanged.

## Limits and next action

Evidence is fixture-only: no real footage, live call, real recognition, physical route, or provider availability is established. The stored video headers used in checks are synthetic and not playable. Size guidance conflicts in the public video page; the conservative bound remains until a later allowed verification. Local media and core persistence remain single-process filesystem storage. There is no provider retry loop, File API upload, UI or billing integration.

Next: host build/HTTP checks and independent review of the exact change. Then 2b-2 adds creator draft-from-video with review/edit; 2b-3 makes the first allowed live call after budget confirmation and records its actual response. A later slice adds File API support for large videos.
