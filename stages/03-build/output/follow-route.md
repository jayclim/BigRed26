# Follow route: Part B, PR 1

Status: implemented and host-verified with fixtures and a fake camera. Date: 2026-10-03.
Branch: feat/follow-camera. The integration owner merges.

## Changes

GuideScreen accepts an optional mode and uploadFrame adapter.
The start effect reads mode from the query when the prop is absent.
A started ref permits one session start under React Strict Mode.
The effect sets mounted true and cleanup sets it false. Late guide results use this mounted ref.
Missing or invalid mode uses mock. There is no fallback from live or replay.
Mode labels and notes have distinct local colors and English and Spanish text.
The mock panel appears only in mock mode. Its camera remains preview only.

One explicit camera check captures one JPEG. The longest side is at most 640 pixels.
JPEG quality is 0.7. One shared limit is 512 KiB.
The shared flight ref covers capture, upload, matching, mock picks, locale changes and manual completion.
The pipeline uploads before it reserves a sequence. The core decides guidance.
Failures keep the last accepted guidance. STALE_FRAME is ignored.
Camera stop clears the stream and stops tracks. It does not invalidate guide progress.
A match already in flight completes and its accepted result appears. Pending clears normally.
Unmount drops late guide results. Camera tracks stop on cleanup.
The Check this view button uses local CSS at the bottom-left, opposite Stop camera.
No timer or automatic capture was added. Arrow rules are unchanged.

POST /api/frames checks the session, content type, content length, streamed size and JPEG header.
It returns existing Result envelopes. Streamed bodies stop at the cap before buffering continues.
Frames use a separate directory and opaque frame_UUID ids.
Saves remove frames older than ten minutes and keep at most 200 files.
Concurrent saves are serialized in the process. readFrame rejects unsafe ids before filesystem access.

## Owned files

- src/features/guide/GuideScreen.tsx
- src/features/guide/Camera.tsx
- src/features/guide/frameCapture.ts
- src/features/guide/checkView.ts
- src/features/guide/checkView.check.ts
- src/features/guide/mode.module.css
- src/client/frameUpload.ts
- src/server/frames/frames.ts
- src/server/frames/http.ts
- src/server/frames/frames.check.ts
- src/app/api/frames/route.ts
- scripts/follow-camera.check.mjs
- scripts/follow-frames.check.mjs
- stages/03-build/output/follow-route.md

## Actual checks

Host checks on 2026-10-03 (macOS, Node 24.21.0, local Chrome) after the repair. All passed.
The worker sandbox blocked localhost servers (listen EPERM) and the Google font fetch, so the lead ran every command on the host.

| Command | Actual result |
| --- | --- |
| npm run check | PASS. Core, media and extraction checks (32 cases, no network calls). |
| npm run typecheck | PASS. |
| node src/server/frames/frames.check.ts | PASS. JPEG validation, opaque ids, safe reads, age retention, concurrent count cap, direct handler validation. |
| node src/features/guide/checkView.check.ts | PASS. Target direction, unknown, wrong approach, upload and recognizer failures, one flight, unmount drop, stale ordering, locale, pinned v1, explicit manual completion, capture bounds. |
| npm run build | PASS. /api/frames is a dynamic route. |
| node scripts/smoke-api.mjs 3141 | PASS. One earlier host run before the repair failed once and passed on two reruns; the failure output was not kept. |
| node scripts/follow-frames.check.mjs 3142 | PASS. Valid upload stored in a temp directory; wrong type, oversize and chunked oversize, missing and unknown session, empty and non-JPEG bodies rejected with Result envelopes. |
| node scripts/follow-camera.check.mjs 3143 | PASS. 390x844 and 1280x800: default mock badge, panel and pick; production live and replay fail honestly; live label without mock panel; one upload per double click; busy button; core guidance shown; locale keeps cursor; unknown removes the arrow; stop keeps the late accepted result and clears the stream; no control overlap; keyboard Tab and Enter; denied camera alert and Try again. 6 synthetic uploads, 6 recognitions. |

The lead reviewed screenshots of mock and live at 390 and 1280 and the denied state at 390.
The live and denied states use CDP Fetch interception with a script-local core and an injected recognizer. This is UI and lifecycle evidence, not recognition evidence.
The browser script runs a production build. The one-session-per-mount assertion does not exercise React Strict Mode double effects; the started guard covers dev by code review only.
Pre-existing, not in scope: the last crumb dot overlaps the destination label ("Room 204") at both widths in mock and live.

## Design details and limitations

Camera uses onCheck and busy. It has no onStop or onFrame prop.
onCheck passes a capture function to the guide. This lets the shared flight lock cover canvas encoding before a Blob exists.
The route delegates to a small receiveFrame function for direct Node checks.
These changes do not alter shared contracts or core semantics.

There is no production live recognizer yet. Production live and replay session starts still return PROVIDER_UNAVAILABLE.
Observed evidence uses approved synthetic fixtures and injected recognizers only.
There is no provider or physical-device evidence. There is no automatic capture.
JPEG validation checks magic bytes. It does not decode or prove a complete JPEG image.
Retention runs on saves. It is not a background expiration task.
The flight lock remains held until the old operation settles after camera stop.
Stop keeps accepted results from a match already sent to the core.
Camera retains its own generation ref for camera start and stop races.
The browser check compares the displayed sequence with the core last accepted sequence.
It also checks button overlap at 390x844 and 1280x800, and one session start per mount.

## Integration requests

The owner must register the new module checks in npm run check and CI.
Commands to add: node src/server/frames/frames.check.ts, node src/features/guide/checkView.check.ts, and after build node scripts/follow-frames.check.mjs and node scripts/follow-camera.check.mjs (needs local Chrome).
The owner can later expose mode selection in the app mount and register a live recognizer in instance.ts.
No shared-file change is required for this local implementation.
Do not claim real recognition from these fixture tests.

Next action: PR 2, the live Recognizer with fake provider and transport tests. No real provider call until spending caps are confirmed.
