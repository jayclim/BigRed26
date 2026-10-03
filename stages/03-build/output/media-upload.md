# Local route video upload (queue item 2a)

Status: locally verified, 2026-10-03. Code repair `3834abc` (docs `1a65ec9`) passes host code gates, HTTP smoke, rendered 390/1280 checks (synthetic video only) and an independent [SOL] repair review (APPROVE). Squash-merged through PR #6; the merge hash is in `.overnight/media-handoff.json`. Draft extraction is pending. Worktree: `media-upload`; branch: `feat/media-upload`. Published as a draft PR by lead 61afc312; no provider call or deployment was made.

## Behavior and choices

- The creator has a focused **Teach from a video** panel. It uses the existing step, button and notice styles. The native file picker checks type, empty files and size. It shows filename, bytes, MB and a muted, inline video preview. Object URLs are revoked on change and unmount.
- Upload uses `POST /api/media` and requires exactly one native multipart entry named `file` containing a File. Busy controls are disabled. Results receive focus and scroll to the viewport center to clear the mobile sticky bar. Errors have an alert and recovery controls. Success says **Stored locally**, shows the media id, and says **Draft extraction from this video is not connected yet**. The panel is keyed by route id; switching routes resets upload state and uses the existing unmount abort.
- Accepted types are `video/mp4`, `video/quicktime` and `video/webm`. The file limit is 100 MB (104,857,600 bytes). Empty files are rejected. The server checks ISO BMFF `ftyp` at offset 4 for MP4/MOV, or the EBML `1A 45 DF A3` signature for WebM. A signature does not establish playable video or a supported codec.
- `Content-Length` is checked before multipart parsing when present. A counted native Web stream enforces `MAX_MEDIA_REQUEST_BYTES` before `Response.formData()`, even without a valid length header. It cancels the source as soon as the count exceeds the allowance. The body allowance is 100 MB plus 20 KiB (104,878,080 bytes); the file limit stays exactly 100 MB. Invalid multipart fields and oversized bodies return recoverable `INVALID_INPUT` errors and write nothing. The installed Next 16.3.8 guides confirm native body APIs and that `experimental.proxyClientMaxBodySize` only applies with Proxy. This app has no Proxy; the unused setting was removed. No global body limit was added.
- Media files use `<uuid>.<ext>` and sibling `<uuid>.json` metadata with `id`, sanitized display-only `originalName`, `type`, `size` and `uploadedAt`. Client filenames never determine a path. Storage uses temporary files and rename, publishing metadata last. Write failures return retryable `PROVIDER_UNAVAILABLE` and remove the partial pair. A cleanup failure is reported explicitly.
- `BREADCRUMB_MEDIA_DIR` overrides storage. The default is `media` beside `BREADCRUMB_DATA_FILE`, normally `.data/media`. The response type is local to the media module and includes `extraction: 'pending'`. Contracts, route data and `startBuild` are unchanged; extraction still returns `PROVIDER_UNAVAILABLE`.

## Observed checks

Worker (sandbox, lead 257f10d5, job task-mus6omm1-alusx4, cancelled without handback; partial work preserved): `npm run typecheck` PASS; `npm run check` PASS including synthetic media header, limit, storage, metadata and write-failure checks; direct compiled-handler checks PASS (not HTTP evidence). Sandbox build and HTTP were blocked by port permissions.

Model routing: [LUNA] `gpt-6-luna` ignore fix observed through a completed native handback (job task-mus79spc-ehkwyv, thread 01a10121-b247-7dd2-bd90-33954c7c3bd7, lead b645fb94, ended 2026-10-03T09:40:56Z). The earlier [SOL] job has no handback, so no Sol routing success is claimed for this slice.

Host (lead b645fb94, 2026-10-03, Node 24.11.1):

| Check | Result |
|---|---|
| `git check-ignore` after the `/media/` fix | Source media files included; root `media/` and `.data/` ignored. |
| `npm run build` (normal Turbopack, real fonts, no mocks) | PASS; `/api/media` present. |
| `node scripts/smoke-api.mjs 3127` | PASS: synthetic MP4 stored with matching bytes/metadata; empty, wrong-magic and non-multipart rejected; all existing cases pass. |
| Headless Chrome via CDP, isolated data and media dirs, 390×844 mobile and 1280×800 | PASS in idle, rejected type (`.txt`), server error (`.mp4` with zero header, 400), recovery, selected and success states. No horizontal overflow. Errors use `role=alert` and receive focus. Choose another file returns focus to the input. Success receives focus and shows the media id; files were stored. Tab after success shows a 3px focus outline. |
| Preview | A 1 s 160×120 H.264 test pattern generated locally with ffmpeg loaded in the preview (`readyState` 4, duration 1 s, 160×120, no error). Playback was not driven. This is synthetic, not route footage. |

Screenshots and the script are in ignored `.overnight/ui-media/` and `.overnight/ui-media.mjs`.

## PR #6 bounded repair receipt

Date: 2026-10-03. Assignment: [SOL], base `da0e6923b0945fa6c08af0e28a69da0a8b5ed6f8`. Only assigned paths in the media-upload worktree were changed. No subagents, installs, provider calls, deployment, push or merge.

All four review items were repaired: counted body limit and one-file validation; unused Proxy config removal and corrected claims; centered result/error focus; route-keyed upload state with the existing unmount abort. Native streams and multipart parsing were reused. The 100 MB file policy and MP4/MOV/WebM types are unchanged.

Checks used the installed Node 24.11.1 with `PATH=/Users/jaydenl/.nvm/versions/node/v24.11.1/bin:$PATH`:

| Command | Actual result |
|---|---|
| `npm run check` | PASS: core regressions and media checks. An endless no-length stream and a false-length stream cancel within two 64-byte chunks of a 256-byte cap. Duplicate `file`, extra, missing, wrong-name and text-only fields are rejected; the media directory stays unchanged. Accepted synthetic headers still store matching bytes and metadata. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS: normal Turbopack production build, `/api/media` present. Four dynamic filesystem tracing warnings remain. |
| `node scripts/smoke-api.mjs` | BLOCKED, exit 1: `Error: listen EPERM: operation not permitted 0.0.0.0:3107`; then `Error: next start exited (1). Is port 3107 free and the app built?` No HTTP case ran. |
| `node --check scripts/smoke-api.mjs` | PASS: smoke script syntax. |
| `git diff --check` | PASS. |

The first `npm run check` attempt used the default Node 19.8.1 and failed with `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"` for `src/server/core/core.check.ts`. Selecting the existing Node 24 runtime fixed it; no install was needed.

The smoke script now generates an over-limit multipart body in memory through a `ReadableStream` with `duplex: 'half'` and no Content-Length. It expects HTTP 400 `INVALID_INPUT` from the body cap and an unchanged media directory. Its header-only synthetic bytes are not playable footage. HTTP and a fresh rendered 390 px success/error and route-switch check remain for the host lead.

The worker could not commit (sandbox `index.lock` permission). The host lead committed and pushed the repair as `1a65ec9`.

## Limits, handoff and next action

- **Ignore fix:** root `.gitignore` now uses `/media/` (was `media/`), so `src/app/api/media/` and `src/server/media/` are tracked; root `media/` and `.data/` stay ignored.
- The earlier 390 px sticky-bar overlap is repaired; rendered checks at 390 and 1280 px confirm it (see the final section). No screen-reader, physical-phone or real-footage playback evidence is claimed.
- No real footage, near-100 MB HTTP transfer, codec decoding, concurrent-load or crash-recovery test was run. Native `formData()` still buffers bodies within the enforced cap in memory. The two renames are not one transaction; a process crash between them can leave an orphan video. Reported write failures are cleaned up.
- Local disk is for the local Node app. Vercel Functions cap request bodies at 4.5 MB; hosted upload needs direct-to-storage later. No hosted storage or provider integration is implemented.
- Next action: **item 2b, Gemini draft extraction from stored media**, with validated editable drafts that remain unapproved until human review. No paid provider or Cursor call until spending caps are verified.

## Host checks, repair 3834abc (lead 9a13c7fb, 2026-10-03)

- PASS on host (Node 24.11.1): `npm run check`, `npm run typecheck`, `node scripts/smoke-api.mjs`. The smoke sent a real chunked request with no Content-Length above `MAX_MEDIA_REQUEST_BYTES`: 400 INVALID_INPUT, media directory unchanged. Worker sandbox: `npm run build` PASS.
- Browser (CDP, 390x844 and 1280x800): the focused client error message was fully visible above the sticky approve bar without a forced scroll (390: top 360, bottom 484, bar top 720). Recovery ("Choose another file") moved focus to the file input. Switching to the detailed-action fixture reset the panel to idle.
- Limit: the run's fixture files were missing, so every selection was a 0-byte file. The server-error, success and preview states were not reached in this run. Recheck them with regenerated fixtures (synthetic test pattern only, not route footage).

## Final host UI check and repair review, `1a65ec9` (lead 3d71f12c, 2026-10-03T10:25:18Z)

- Headless Chrome via CDP on the normal production build of `1a65ec9`, isolated data/media dirs, 390x844 mobile and 1280x800: **35/35 PASS**. Synthetic fixtures only (17 B `.txt`, 1,960 B bad-signature `.mp4`, 8,350 B ffmpeg test pattern); no route footage.
- Both sizes: the focused client error, server error and success messages are inside the panel and fully visible above the sticky bar. Selected size text matches the real file size. Preview: `readyState` 4, duration 1 s, 320x240, no error. Server rejection leaves storage unchanged. Success stores exactly one `<id>.<ext>` + `<id>.json` pair whose id matches the shown media id. Route switch resets the panel to idle with no preview. No horizontal overflow.
- The previous run (lead df3312f2) reported 6 failures. All were harness assertion bugs, not app defects: `/0 bytes/` matched `1,960 bytes` and `8,350 bytes`, and the storage count counted files instead of video+metadata pairs. The harness now checks the parsed byte count against the fixture size, the error text, and complete pairs by id. No tested requirement was weakened.
- Independent [SOL] `gpt-6.1-sol` read-only review of `da0e692..1a65ec9` (native Agent `a05016ddd8d319016`, foreground, completed): **APPROVE**, no blocking findings. All four repair points confirmed.
