# Local route video upload (queue item 2a)

Status: implemented and host-verified in code, HTTP and headless-browser gates, 2026-10-03. Draft extraction is pending. Worktree: `media-upload`; branch: `feat/media-upload`. Published as a draft PR by lead 61afc312; no provider call or deployment was made.

## Behavior and choices

- The creator has a focused **Teach from a video** panel. It uses the existing step, button and notice styles. The native file picker checks type, empty files and size. It shows filename, bytes, MB and a muted, inline video preview. Object URLs are revoked on change and unmount.
- Upload uses `POST /api/media`, native multipart `FormData` and the `file` field. Busy controls are disabled. Results receive focus. Errors have an alert and recovery controls. Success says **Stored locally**, shows the media id, and says **Draft extraction from this video is not connected yet**.
- Accepted types are `video/mp4`, `video/quicktime` and `video/webm`. The file limit is 100 MB (104,857,600 bytes). Empty files are rejected. The server checks ISO BMFF `ftyp` at offset 4 for MP4/MOV, or the EBML `1A 45 DF A3` signature for WebM. A signature does not establish playable video or a supported codec.
- `Content-Length` is checked before multipart parsing when present. The body allowance is 100 MB plus 20 KiB for multipart boundaries and headers; the file limit stays exactly 100 MB. The installed Next 16.3.8 Proxy guide documents a 10 MB default buffer. `next.config.ts` sets only the documented `experimental.proxyClientMaxBodySize` option to 104,878,080 bytes. No Server Action limit was changed.
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

## Limits, handoff and next action

- **Ignore fix:** root `.gitignore` now uses `/media/` (was `media/`), so `src/app/api/media/` and `src/server/media/` are tracked; root `media/` and `.data/` stay ignored.
- On a 390 px phone, the sticky Save/Approve bar can cover the lower part of the upload panel, including a newly focused result message, until the user scrolls. Not fixed here; candidate narrow follow-up. No screen-reader, physical-phone or real-footage playback evidence is claimed.
- No real footage, near-100 MB HTTP transfer, codec decoding, concurrent-load or crash-recovery test was run. Native `formData()` buffers uploads in memory. The two renames are not one transaction; a process crash between them can leave an orphan video. Reported write failures are cleaned up.
- Local disk is for the local Node app. Vercel Functions cap request bodies at 4.5 MB; hosted upload needs direct-to-storage later. No hosted storage or provider integration is implemented.
- Next action: **item 2b, Gemini draft extraction from stored media**, with validated editable drafts that remain unapproved until human review.
