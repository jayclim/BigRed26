# Follow route: Part B, PR 1

Status: implemented and host-verified with fixtures and a fake camera. Date: 2026-10-03.
Branch: feat/follow-camera. The integration owner merges.

## Changes

GuideScreen accepts an optional mode and uploadFrame adapter.
The mode prop is read once at mount. Remount GuideScreen to change the mode.
The start effect reads mode from the query when the prop is absent.
A started ref permits one session start under React Strict Mode.
The effect sets mounted true and cleanup sets it false. Late guide results use this mounted ref.
Missing or invalid mode uses mock. There is no fallback from live or replay.
Mode labels and notes have distinct local colors and English and Spanish text.
Camera checks run only in live mode. Replay and mock are preview-only, and the mock panel appears only in mock mode.

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

POST /api/frames requires the returned session ID to equal the requested ID. Inherited object names such as `__proto__` are rejected with 404. It also checks content type, content length, streamed size and JPEG header.
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

Host checks on 2026-10-03 (macOS, Node 24.21.0, local Chrome) after the review repair (live-only camera checks). All passed.
The worker sandbox blocked localhost servers (listen EPERM) and the Google font fetch, so the lead ran every command on the host.

| Command | Actual result |
| --- | --- |
| npm run check | PASS. Core, media and extraction checks (32 cases, no network calls). |
| npm run typecheck | PASS. |
| node src/server/frames/frames.check.ts | PASS. JPEG validation, opaque ids, safe reads, age retention, concurrent count cap, direct handler validation. Missing and inherited-name sessions return 404 with `NOT_FOUND`; the stored-file count stays 1. |
| node src/features/guide/checkView.check.ts | PASS. Target direction, unknown, wrong approach, upload and recognizer failures, one flight, unmount drop, stale ordering, locale, pinned v1, explicit manual completion, capture bounds. |
| npm run build | PASS. /api/frames is a dynamic route. |
| node scripts/smoke-api.mjs 3151 | PASS. One earlier host run before the repair failed once and passed on two reruns; the failure output was not kept. |
| node scripts/follow-frames.check.mjs 3152 | PASS. Valid upload stored in a temp directory; wrong type, oversize and chunked oversize, missing and unknown session, empty and non-JPEG bodies rejected with Result envelopes. |
| node scripts/follow-camera.check.mjs 3153 | PASS. 390x844 and 1280x800: default mock badge, panel and pick; production live and replay fail honestly; replay label with a preview-only camera and no check button; live label without mock panel; one upload per double click; busy button; core guidance shown; locale keeps cursor; unknown removes the arrow; stop keeps the late accepted result and clears the stream; no control overlap; keyboard Tab and Enter; denied camera alert and Try again. 6 synthetic uploads, 6 recognitions. |

The lead reviewed screenshots of mock and live at 390 and 1280 and the denied state at 390.
The live and denied states use CDP Fetch interception with a script-local core and an injected recognizer. This is UI and lifecycle evidence, not recognition evidence.
The browser script runs a production build. The one-session-per-mount assertion does not exercise React Strict Mode double effects; the started guard covers dev by code review only.
Pre-existing, not in scope: the last crumb dot overlaps the destination label ("Room 204") at both widths in mock and live.

## Design details and limitations

The shared core lookup in `src/server/core/core.ts` (`sessionOf`) still resolves inherited object names. The integration lead owns that fix with `Object.hasOwn` or a null-prototype map.

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

# Part B, PR 2: live recognizer

Status: implemented and checked locally with fake providers and fake transport. Date: 2026-10-03.
Branch: feat/follow-recognizer, PR base feat/follow-camera. The integration owner registers the recognizer and merges.

## Changes

createRecognizer reads the uploaded frame and sends all checkpoint candidates to the provider.
Candidates contain ids, labels, identifying evidence, approach descriptions and action target metadata.
They do not contain approved instructions, action steps or completion text.
Strict, bounded output validation returns only an Observation. The core owns guidance and progress.
Unknown ids and invalid output fail with retryable PROVIDER_UNAVAILABLE. Null ids return unknown with empty evidence.
A single deadline bounds frame reads and providers that ignore the abort signal.
One flight per session limits concurrent recognition cost. Every exit releases the flight.
The Gemini adapter has a separate enable flag, bounded response reads and safe error messages.
HTTP 429 returns retryable RATE_LIMITED. No logging or replay recognizer was added.

## Owned files

- src/server/recognition/recognizer.ts
- src/server/recognition/gemini.ts
- src/server/recognition/recognizer.check.ts
- stages/03-build/output/follow-route.md (this appended section)

## Actual checks

Local runtime: Node 26.8.2. Node 24 was requested but was not the runtime supplied here.

| Command | Actual result |
| --- | --- |
| node src/server/recognition/recognizer.check.ts | PASS. Five groups: approved guidance and validation; single flight and deadlines; manual stale race; destination arrival without timer progress; fake transport and absent modes. |
| npm run check | PASS. Existing core, media and extraction checks; extraction reports 32 cases and no network calls. |
| npm run typecheck | PASS. tsc --noEmit. |

The recognition check replaces global fetch with a throwing stub and injects fake transport.
Initial recognition check runs failed on Buffer versus Uint8Array comparison, an invalid attempt to overwrite approved v1, and test synchronization before the second provider entered.
These test harness errors were repaired. The final check passed.
No build or server was run by the worker. No real provider was called.

Host checks by the lead on 2026-10-03 (macOS, Node 24.21.0). All passed.

| Command | Actual result |
| --- | --- |
| node src/server/recognition/recognizer.check.ts | PASS. All five groups. |
| npm run check | PASS. Core, media and extraction (32 cases, no network calls). |
| npm run typecheck | PASS. |
| npm run build | PASS. Route table unchanged. No app module imports the recognizer yet, so the build does not bundle it. |

node scripts/smoke-api.mjs was not run. This change adds no HTTP handler and changes no HTTP behavior.

## Review repair

2026-10-03, PR #12: non-OK Gemini responses left the body open. The adapter now cancels the body without waiting before it throws the same safe error. Network-free 429 and 500 streams exceed the size cap and never settle cancellation; each cancels once and returns the expected retryable code. All five recognition groups, npm run check and npm run typecheck passed. No live provider call was made. Host rerun by the lead (Node 24.21.0): recognition check, npm run check, typecheck and build passed.

### Review repair: blank evidence

2026-10-03, PR #12: the evidence schema accepted empty and whitespace-only strings. Core checked only that evidence had entries, so these values could advance guidance or arrive. The schema now trims each item and requires 1–200 characters; any blank item rejects the full provider output as retryable `PROVIDER_UNAVAILABLE`. Checks cover empty, whitespace-only and mixed evidence, including a destination after progress to the prior checkpoint. They also cover trimmed valid evidence and JSON Schema `minLength: 1`. Before the fix, the new check failed because `matchFrame` returned `ok: true` for blank evidence. After the fix, the recognition check passed. `npm run check` and `npm run typecheck` results are recorded for this repair below. No real fetch or provider call was used.

Actual checks in this worktree: `node src/server/recognition/recognizer.check.ts` passed all six groups, including the new blank-evidence group; `npm run check` passed core, media and extraction (32 cases, no network calls); `npm run typecheck` passed (`tsc --noEmit`).

## Design details and limitations

There is no production registration in this change. Live and replay still fail honestly without registration.
The real Gemini request shape is unverified against a live call.
The core window is current/next only. The recognizer sends all approved checkpoint candidates.
JPEG bytes are not decoded. Visible-text truth requires provider evidence; schema checks prove structure and bounds only.
Legacy checkpoints without an action still accept any non-blank evidence string in core. Matching evidence against `identifyingEvidence` remains an integration-owner core decision.
The stale race uses sequence 1 to activate the action, then slow sequence 2 and manual sequence 3.
The core requires an active action for completeAction, so slow sequence 1 versus manual sequence 2 cannot be accepted in a fresh session without first activating that action.
Manual completion remains a core behavior and can reach a destination; the observation-arrival check proves that idle time does not advance the route.

## Integration requests

In src/server/core/instance.ts, add this import:

```ts
import { liveRecognizer, liveRecognitionEnabled } from '../recognition/gemini.ts';
```

Use this recognizers entry in createCore:

```ts
recognizers: { mock: fixtureRecognizer, ...(liveRecognitionEnabled() ? { live: liveRecognizer } : {}) },
```

Add `node src/server/recognition/recognizer.check.ts` to npm run check and CI.
Set `BREADCRUMB_GEMINI_RECOGNITION=1` and `GEMINI_API_KEY` only after provider spending is authorized.
`GEMINI_MODEL` is optional. The default is DEFAULT_GEMINI_MODEL from extraction.
The production provider config is captured at module load. Restart after env changes.
Part A note: src/server/extraction/extraction.ts also throws on non-OK Gemini responses without cancelling the body. Part B did not edit it.

Next action: owner reviews and registers the module, adds the check to CI, and reruns build and HTTP smoke after registration. A live provider call requires separate authorization.
