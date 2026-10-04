# Breadcrumb: two- or three-person build

Status: coordination assignment, 2026-10-03, requested by Jayden after stopping the overnight run. This replaces the earlier assignment. Part C is reserved for a possible third person; do not dispatch it until an owner is named. The existing executable contracts are unchanged. Claude on Jayden's computer remains the integration owner and sole merger. [Friend setup and prompt](FRIEND-START.md). [Third-person prompt](THIRD-START.md).

## Split and ownership

| Area | Part A — Jayden + integration Claude | Part B — friend + task Claude |
|---|---|---|
| User result | Teach: upload → extract → edit → review → approve/share | Follow: open approved route → camera → guidance → arrive/recover; consume optional voice |
| UI | `src/features/creator/**` | `src/features/guide/**`, including Camera and reconcileGuide; use guide-local CSS modules |
| Server | `src/server/media/**`, `src/server/extraction/**`; existing video/extraction handlers | New `src/server/recognition/**`, `src/server/frames/**` |
| HTTP additions | Existing route/session handlers and their semantics remain integration-owned | New `src/app/api/frames/**`, if needed; validate inputs and return existing Result envelopes |
| Client additions | `src/client/httpCore.ts` remains frozen | New `src/client/frameUpload.ts`, if needed |
| Evidence | `stages/03-build/output/teach-route.md` plus existing creator extraction receipt | `stages/03-build/output/follow-route.md`, `scripts/follow-*.mjs`, module-local checks and fixtures |
| Shared files | Sole owner: `contracts/**`, `src/server/core/**`, root package/lock/config, app mounts, `src/ui/**`, canonical knowledge and `PROGRESS.md` | Read and reuse. Request a small integration change in the PR; do not edit shared files concurrently. |

Part C — third person (reserved): own `src/server/voice/**`, `src/app/api/speech/**`, `src/client/voice.ts`, `src/demo/**`, `scripts/voice-*.mjs`, and `stages/03-build/output/voice.md`. Build ElevenLabs synthesis and its browser adapter, then collect route/audio/demo evidence. Do not edit guide components, creator files, global styles, core or shared contracts. Put recordings outside Git; commit only non-sensitive evidence notes and licensed presentation assets.

With two people, Part B starts with camera/recognition only. Jayden can later assign the unclaimed Part C paths to that friend for a separate voice PR. With three people, C can work at the same time. Never assign the same paths to B and C together.

Part A must not edit Part B or C paths after handoff. Part B must not edit creator files or global CSS. No third-party messaging, analytics, glasses integration or deployment in either lane. Adding a library needs an integration-owner change; start with installed dependencies and native APIs.

## Contract freeze

Baseline: main `3d1cb405c5c741abdd453c31fb592129213f9625` (PRs 1–7 merged). Read these executable sources, not the original kit's older signatures:

- [Types](../../contracts/contracts.ts), [runtime schemas](../../contracts/schemas.ts), [amendments](../../contracts/AMENDMENTS.md).
- [Core and Recognizer](../../src/server/core/core.ts), [HTTP client](../../src/client/httpCore.ts).
- [Legacy fixture](../../contracts/fixture.v1.json), [action fixture](../../contracts/fixture.actions.v1.json).

The boundary between lanes is an immutable **approved Route at schemaVersion 1**, with opaque id and version, ordered checkpoints, source/reference media IDs, evidence, approach descriptions, exact English/Spanish instructions and optional detailed actions. Keep target, side, floor, ordered steps and completion. No destination action. Missing action fields stay missing on legacy routes.

Part A saves drafts through `saveDraft`, then calls `approveRoute(id, version, reviewedCheckpointIds)` with every reviewed checkpoint. Gemini output is always an unapproved draft. A new edit to an approved route creates a new version. Approval is a human action.

Part B uses the existing CoreAdapter: startSession → getRoute at the pinned version → reserveFrameSequence → matchFrame. FrameRequest contains sessionId, routeVersion, sequence, capturedAt (UTC) and opaque mediaId. Do not put image bytes, paths or data URLs in mediaId. Frame upload is a new Part B concern: the existing `/api/media` accepts videos only. Keep image storage and retention separate from teaching videos. Image transport details stay inside Part B and need review before endpoint integration; Part A does not depend on them.

The existing Recognizer signature is `(route: Route, request: FrameRequest) => Promise<Result<Observation>>`. Observation is either unknown with evidence, or a checkpoint ID with approachConfirmed and evidence. It does not return directions or Guidance. The core owns progression, exact approved text and arrival. Export one production Recognizer from Part B and provide its registration instructions; the integration owner wires it into `src/server/core/instance.ts`. Until then, test it through `createCore` with injected recognizers and throwaway state. Production live sessions currently fail honestly when no recognizer is installed.

The B↔C boundary uses existing `VoiceAdapter.synthesize(SpeechRequest): Promise<Result<SpeechClip>>`. SpeechRequest contains text, locale, voiceId and instructionId. SpeechClip contains audioUrl, provider `elevenlabs` and cached. Read exact accepted Guidance.text, deduplicate speech, cancel obsolete clips and keep mute/captions functional. Browser speech must remain explicitly labeled when used. Never expose provider keys to the browser.

Coordination interface to implement (not present yet): C exports `httpVoice: VoiceAdapter` from `src/client/voice.ts`, backed by `POST /api/speech` with JSON SpeechRequest → Result<SpeechClip> and the existing HTTP error mapping. C owns validation, bounded text/body sizes, server credentials, provider timeout/error handling, cache and audio delivery under its owned paths. B adds an optional `voice?: VoiceAdapter` prop to GuideScreen. B owns audio playback, cancellation, mute, captions and the clearly labeled browser fallback. If no voice adapter is supplied, the existing browser speech still works. A wires `voice={httpVoice}` in the client app mount only after both PRs pass. B tests with an injected fake adapter; C tests through a standalone HTTP/audio harness. Neither imports the other's unmerged files. This preserves existing required GuideScreen props and all shared types.

A shared schema/signature change requires a separate contract PR by the integration owner with updated fixtures/checks before either lane relies on it. Do not fork types or introduce a second state machine. Human acceptance of this assignment does not mean that live recognition or any new endpoint already works.

## Independent checkpoints

Part A:
1. Resume the saved creator extraction UI in Jayden's `.worktrees/creator-extraction-ui`; do not rebuild it. Core/type checks passed; build/browser/review/publication remain pending. This uncommitted work is not in a fresh clone.
2. Verify upload/extraction success, disabled provider, failure/retry, cancel/late response, unsaved edits and draft switching using fixtures. Review every checkpoint, approve, reload and open the follow link.
3. Export a schema-valid approved route fixture. Check both legacy and detailed actions, and that a session pinned to v1 stays on v1 after v2 approval.

Part B, separate PRs in this order:
1. Camera/frame capture and guide lifecycle using the existing approved fixtures and injected recognizer. Test permission denial, bounded capture, one match in flight, stop/unmount cleanup, stale responses, locale changes and clear mock/live/replay labels. Keep existing mock flows working.
2. Live Recognizer with fake provider/transport tests: target match, wrong approach, unrelated frame, invalid output, timeout/rate limit and missing media. Do not call a real provider until free/included caps are confirmed. Register production mode only through the integration owner.
3. Add the optional VoiceAdapter consumer and playback lifecycle, tested with a fake adapter. Test duplicate instructions, mute, locale switch, stale clips and playback rejection. This can proceed before C's implementation merges.

Part C:
1. Implement VoiceAdapter, HTTP endpoint, audio delivery and `httpVoice` with injected provider tests. Check exact text forwarding, locale/voice cache isolation, invalid/oversized input, concurrent requests, timeout, rate limit and missing credentials. Do not echo provider response bodies or keys. Do not change navigation state.
2. Prove browser audio in a standalone local harness using a known test clip. This verifies transport/playback only, not ElevenLabs. After spending caps are confirmed, record a separate real-provider English/Spanish test; after device access is arranged, record actual phone audio.
3. Coordinate one teaching video, an independent follow pass and an unrelated view with Jayden. Build a concise demo from actual screenshots/results. Keep fixture, replay, real-provider and physical evidence separate. No claimed sponsor success without observed evidence.

All lanes run `npm run check`, `npm run typecheck`, `npm run build`; HTTP changes also run `node scripts/smoke-api.mjs` after build. New checks must have explicit commands in the PR; the integration owner adds them to the shared check script and CI. Use temporary stores and injected providers. Do not run `npm run reset`. Render affected screens at phone and desktop widths and test keyboard focus. A fixture response is not live provider evidence.

## Integration and physical gate

The integration owner reviews each exact PR head, registers Part B's recognizer and Part C's voice adapter as needed, adds checks to CI, and reconciles knowledge before merging. All commits must be pushed. Separate Claude task sessions may supervise each lane, but only Jayden's named integration Claude merges. No worker merges or changes shared contracts alone.

Integration test: approve a Part A route, start a Part B session, connect Part C voice, match through it, exercise an unknown frame, wrong approach, manual action, locale switch, provider error and destination. Assert pinned versions, centrally allocated sequences, no arrows on uncertainty/reorient, and explicit manual evidence. Repeated elevator entrance views cannot prove Floor 3. No timer can advance or announce arrival.

Each machine has its own local JSON/media store; a route ID is not a network sync mechanism. Independent tests use the same committed fixtures. For a real integration test, run the merged app in one checkout/store. Transfer real route JSON and required media privately with IDs preserved if using a second machine. Credentials alone do not transfer route data.

Final physical gate: an independent phone pass completes the approved route; an unrelated view stays uncertain; wrong-facing evidence removes the arrow; destination evidence is observed; audio works on the target phone. No real footage or provider success has established this gate yet. Phone camera access needs a reachable secure origin; deployment remains a separate decision.

## Current operating limits

The overnight automation is paused at the user's request. Do not restart it or use its expired deadline as a new work order. A new AI run needs an explicit bounded attended task and current usage checks under the work protocol. Claude sign-in expired on Jayden's computer; friend sign-ins and model/plugin availability must be checked on the friend's own machine. Keep the 55% weekly dispatch buffer below the 60% ceiling and the 95% session threshold when using Jayden's Claude allowance. Default extra spend remains zero. `.env.local` has been shared privately, but free provider allowance is still unverified.
