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

# Follow route: Part B, PR 3 (voice consumer)

## Status

Implemented and host-verified with fake voice and audio adapters. Date: 2026-10-03.
Browser speech states were rendered in the real app mount. No provider call was made. Generated-voice states were not rendered in a browser.

## Branch

feat/follow-voice-main, based on main 9b65316 (includes #11 and #13). It supersedes PR #14 (feat/follow-voice), which was stacked on the pre-repair #12 commits. It has no dependency on PR #12. The voice commits df0580a..76e0222 were rebuilt here as one change.
The host lead commits. The integration owner merges.

## Changes

GuideScreen accepts an optional VoiceAdapter. Required props stay required.
Without the adapter, browser speech keeps its existing instruction-id rule.
A visible line under the top controls says Browser speech / Voz del navegador, or Generated voice / Voz generada. The sound button references it with aria-describedby.
Sound starts off. Captions and navigation state stay independent of voice.
Voice failures use a separate translated status line. Provider error bodies are not shown or logged.

voicePlayback.ts has no React imports or DOM globals at import time.
It forwards the exact accepted Guidance.text, locale and instructionId.
DEFAULT_VOICE_ID is the exported guide token 'default'.
Native audio plays the returned audioUrl. No browser speech fallback runs with an adapter.
Session id, instruction id, locale and text form the deduplication key. Sequence changes do not replay successful speech.
Only the current key is deduplicated, as with browser speech. A, B, A speaks A again.
A failure clears the current key. The next speak call can retry the same instruction.
A new instruction cancels old audio. Mute, locale changes and unmount cancel obsolete work.
Cancellation pauses audio, clears its src and invalidates late results with a generation token.
Mute clears deduplication. Enabling sound again speaks the current instruction once.
A successful play or mute clears voice status. No timer advances navigation.

## Checks

Commands below ran in this checkout. All exited 0.

| Command | Actual result |
| --- | --- |
| node src/features/guide/voicePlayback.check.ts | PASS. 7 groups, 0 failures. Duplicate instructions and exact fields; mute and re-enable; Spanish switch; stale synthesis; playback and synthesis failures; dispose; source label and caption assertion. |
| node src/features/guide/checkView.check.ts | PASS. 8 groups, 0 failures. Existing guide, sequence, locale, manual and capture checks. |
| npm run check | PASS. Core and media checks passed. Extraction passed 32 cases with no network calls. Core and media do not print case counts. |
| npm run typecheck | PASS. tsc --noEmit. |
| npm run build | PASS. Compiled successfully and generated 6 static pages. Six dynamic filesystem tracing warnings came from existing server files. |
| git diff --check | PASS. No whitespace errors. |
| Host: node src/features/guide/voicePlayback.check.ts | PASS, 7 groups, after the lead repair below. |
| Host: node src/features/guide/checkView.check.ts; npm run check; npm run typecheck | PASS. |
| Host: npm run build | PASS. Compiled successfully. |
| Host: node scripts/follow-camera.check.mjs 3153 | PASS, all 8 groups. Existing mock, live, replay, keyboard and denied-camera behavior is unchanged. |
| Host: scratch CDP render at 390x844 and 1280x800 (not committed) | PASS both widths. Real app mount, no voice prop, speechSynthesis stubbed to record calls. Sound off by default with a visible Browser speech line. Tab reaches the sound button with a 3px focus ring; Enter turns sound on and Space mutes. One mock pick speaks the exact fixture text once with en-US; a repeated pick does not repeat it. Mute cancels speech and keeps the caption. The Spanish switch speaks the exact Spanish text once with es-ES and shows Voz del navegador. Label stays between the top bar and the camera stage. Controls have equal heights and no overlap. No horizontal scroll. |

node scripts/smoke-api.mjs was not run. This change adds no HTTP handler.

Lead repairs after the worker handback:
1. The worker's player remembered every spoken key until mute, so A, B, A did not speak A again. Browser speech repeats it. The player now deduplicates only the current key. The check now expects A, B, A to make 3 requests.
2. The first label sat inside the controls row and stretched the other controls. The first fix overlapped the camera stage by 6px on the phone. The label is now an in-flow line under the top controls.

The voice check uses only fake synthesis and fake audio.
The labeling check reads source. It does not establish rendered layout or browser playback.

## Review repair

2026-10-03, PR #14, base head df0580a: a new voice adapter object recreated the player. This cleared the current key and repeated the same instruction. The player now starts in the mount effect and is disposed in cleanup. Each effect setup creates a fresh player, including React Strict Mode setup after cleanup. speak receives the adapter per call. At this repair, a replacement adapter kept the current key and clip, including pending synthesis. The next review repair below corrects pending synthesis. A new instruction uses the supplied adapter. Removing the adapter stops generated audio before browser speech runs. Cleanup also cancels browser speech. Generation tokens still reject late results after cancellation. Two new check groups cover adapter replacement without a pause or repeat request, and late synthesis from X after a new instruction through Y. Actual local results: voicePlayback.check.ts passed all 9 groups; checkView.check.ts passed all 8 groups; npm run check passed core, media and extraction (32 extraction cases, no network calls); npm run typecheck passed with tsc --noEmit. All four commands exited 0. No check failed. The worker ran no build or browser check. Host rerun by the lead on the repaired tree: the same four commands passed, npm run build passed, node scripts/follow-camera.check.mjs 3153 passed all 8 groups, and the scratch CDP render passed at 390x844 and 1280x800 for the browser-speech states. Strict Mode behavior and the generated-voice component path were inspected in source only. No provider or phone check was run.

## Review repair: pending adapter, session key and retry

2026-10-03, PR #14. Verified branch feat/follow-voice and base head 8e5a53c before edits.
Only voicePlayback.ts, voicePlayback.check.ts and this receipt changed.
The untracked PR14-REVIEW-for-Jayden.md was left alone. No commit, push, agent or network/provider call was made.

Findings: P2 suppressed Y when X was still synthesizing the same key. X could then set unavailable or play its old clip.
P3 omitted session id from the key. Identical guidance for S2 could be suppressed while S1 later played.
P3 is hardening. This path is not reachable in the current GuideScreen.
UR1 kept the key after synthesize ok:false, synthesize throw or play() rejection. Repeated checks can keep instructionId stable, so those failures blocked retries.

The player now stores the current key and adapter. The key includes session id.
Same-key calls are deduplicated when audio exists or the pending adapter is unchanged.
A replaced pending adapter cancels the old generation before requesting the new adapter.
Current failures clear the key. The stale-result guard stays before the ok:false branch with no await between them.
The catch branch cancels and clears current only for the current generation. stop clears current too.
Audio stays set after natural completion. dispose and GuideScreen are unchanged.
No sequence counter, timer or export was added.

Seven new check groups cover X throwing, X returning ok:false, X returning ok, session changes and each of the three failure/retry paths.
They also check one request for the same pending adapter, stale X not clearing pending Y, replacement after failure at the same sequence, and deduplication after a successful retry.
The guidance helper now accepts a session id. All nine existing groups keep their meaning.

Before the fix, the new tests ran against unchanged 8e5a53c voicePlayback.ts on Node v26.8.2.
All nine existing groups passed. The command exited 1 with `Regression failures (45)`.
The failures covered every new path: replacement Y not requested, obsolete X setting status or playing (for throw, ok:false and ok), the S2 session request and late S1 audio, and every same-instruction retry case (3 failure kinds x same adapter at sequence+1 or new adapter at the same sequence). The lead shortened the full list of 45 messages to this summary.

The status assertion compares the full status list with []. In the X ok case it also detects an obsolete success callback.
After the exact player fix, actual local results were:

| Command | Actual result |
| --- | --- |
| node src/features/guide/voicePlayback.check.ts | Exit 0. Nine existing PASS lines, seven regression CHECK lines, then `PASS all 7 regression groups`. Zero failed assertions. |
| node src/features/guide/checkView.check.ts | Exit 0. All eight PASS lines. |
| npm run check | Exit 0. `core check passed`, `media checks passed`, `extraction checks passed (32 cases; no network calls)`. Deadline diagnostics: metadata never read 21.3 ms; metadata late read 21.2 ms; media never read 21.2 ms; media late read 20.2 ms. Each used timeoutMs=20, generate=0, save=0. |
| npm run typecheck | Exit 0. `tsc --noEmit`. No EPERM; incremental false was not needed. |
| git diff --check | Exit 0. No output. |

The worker ran no build, browser, provider or phone check. Host rerun by the lead (2026-10-03): with the 8e5a53c player, the new tests report `Regression failures (45)`. With the fix, voicePlayback.check.ts passed all 9 existing groups plus all 7 regression groups. checkView.check.ts (8 groups), npm run check, npm run typecheck and npm run build passed. node scripts/follow-camera.check.mjs 3153 passed 8 groups. The scratch CDP browser-speech render passed at 390x844 and 1280x800. The branch does not include main's #13 theme yet, so the render reflects the older stylesheet. No provider or phone check was run.
Next action: a fresh independent review of the exact head. (Superseded: rebuilt on main in feat/follow-voice-main; see the separation note at the end.)

## Review repair: adapter change during pending play()

2026-10-03, PR #14. Verified feat/follow-voice at 5a73443 before edits.
Finding: audio existed before play() settled. This suppressed a replacement adapter for the same key. A later autoplay rejection could strand the instruction.
The player now stores started separately and sets it only after current play() succeeds.
Adapter replacement during pending play cancels the old generation and requests Y. Same-adapter pending calls and replacement after successful start stay deduplicated.
The mine variable has a type annotation because TypeScript otherwise infers started as literal false. No other playback behavior changed.

The new group checks both late rejection and late resolution, cancellation, same-adapter deduplication, stale status isolation, Y playback and deduplication after start. Y first sets unavailable, then a successful retry clears it.
Against unchanged 5a73443 playback code, the new group exited 1 with 12 failed assertions: missing Y requests, missing X pause/src cleanup, missing Y failure status, stale status clearing, missing Y playback and failed deduplication after start. All 16 existing groups passed.
After the fix, voicePlayback.check.ts exited 0: nine PASS lines, eight regression CHECK lines and `PASS all 8 regression groups`.
checkView.check.ts exited 0 with all eight PASS lines. npm run check exited 0 with core and media passed and extraction passed (32 cases; no network calls). All four deadline diagnostics were 21.2 ms with timeoutMs=20, generate=0 and save=0.
The first typecheck exited 2 with TS2322 (true not assignable to false). After the type annotation, npm run typecheck exited 0 with `tsc --noEmit`. No EPERM occurred.
git diff --check exited 0 with no output.
Only the three assigned files changed. The untracked review file was left alone. No commit, push, agent or network/provider call was made. No build, browser or phone check was run.
Host rerun by the lead (2026-10-03): the 5a73443 player with the new tests reports `Regression failures (13)`. The worker run counted 12. With the fix, voicePlayback.check.ts passed 9 groups plus all 8 regression groups. checkView.check.ts (8 groups), npm run check, npm run typecheck, npm run build, node scripts/follow-camera.check.mjs 3153 (8 groups) and the 390/1280 browser-speech render passed. The branch still predates main's #13 theme.
Next action: independent review of the repair. Browser autoplay and physical phone audio remain unverified.

## Limitations

Generated voice is not wired into the app mount in this PR.
Generated-voice UI states (Generated voice label, Voice unavailable status) were not rendered in a browser. The app mount is outside Part B ownership, and a temporary local mount patch was not permitted. The node check covers player logic: requests, playback and status callbacks. It does not test the generated label text, the translated unavailable message or component wiring.
audio.play() runs after the synthesize promise, outside the tap gesture. Mobile Safari may reject it. The rejection shows Voice unavailable and does not change navigation. Phone behavior is unverified.
Real provider success, browser autoplay permission and physical phone audio remain unverified.
A synthesis request cannot be aborted through the current VoiceAdapter contract.
At 8e5a53c, late results were not ignored for a replaced pending adapter or a changed session. After this fix, those late results are ignored. Part C owns provider deadlines and audio delivery.
Retries happen only when GuideScreen's speak effect runs again: a new Guidance object, sound toggle, locale change or adapter change. There is no timer. Player tests cannot prove React effect frequency.
The existing action caption can differ from the full accepted guidance text. This PR preserves it.
No Next API was added or changed. No dependency or shared contract was changed.

## Integration requests

The integration owner wires voice={httpVoice} in src/app/follow/[routeId]/page.tsx only after Part C's src/client/voice.ts exists and both PRs pass.
Pass the stable module-level httpVoice. Do not create an adapter object per render. A new object each render would keep replacing pending requests.
Add node src/features/guide/voicePlayback.check.ts to npm run check and CI.
Part C maps DEFAULT_VOICE_ID to a server-side voice id. That mapping is Part C's concern.

## Next action

Independent review of the exact PR head. After Part C merges, the integration owner wires voice={httpVoice}, renders the generated-voice and failure states at phone and desktop widths, and tests audio on the target phone.

## Separation from PR #12

2026-10-03: PR #14 (feat/follow-voice) was stacked on the pre-repair #12 commits 0c4858c and 045ea2b. Those commits carry the old recognizer evidence schema, which accepts blank evidence. The integration owner asked that the voice change not bring that code in. #11 merged into main at 9b65316, so this branch rebuilds the voice change on main. The guide files (GuideScreen.tsx, mode.module.css, voicePlayback.ts, voicePlayback.check.ts) are byte-identical to reviewed head 76e0222. The diff against main touches only those files and this receipt. It has no recognizer files and no PR 2 receipt section.

Host checks on this branch (lead): npm ci installed main's locked dependencies from #13. The stale .next cache was cleared. Then voicePlayback.check.ts (9 groups plus all 8 regression groups), checkView.check.ts (8 groups), npm run check, npm run typecheck and npm run build passed. node scripts/follow-camera.check.mjs 3153 passed all 8 groups. The scratch CDP browser-speech render passed at 390x844 and 1280x800 on main's #13 theme: the label sits under the controls, the controls are 44px high, and there is no overlap or horizontal scroll. No CSS change was needed. smoke-api was not run because no HTTP handler changed.

Next action: a fresh independent review of the exact head. Then close PR #14 as superseded.
