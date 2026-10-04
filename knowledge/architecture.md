# Architecture and route knowledge

Status: engineering direction plus inspected implementation, 2026-10-04. Action-aware progression is implemented and checked with injected test recognizers. The product has no mock mode: the `mock` mode value stays in the contract only as a test-double key (see Test doubles). HTTP listener, rendered UI and real-device gates remain unverified in this worker sandbox. Recheck source before editing.

## Two kinds of knowledge

This Markdown brain is **development memory**: scope, design, decisions, sources and evidence for humans and coding agents. The app's **route knowledge** is structured data in `contracts/`: checkpoints, reference views, sign/landmark evidence, approach descriptions, approved bilingual instructions and a versioned route. Development notes are not runtime navigation input.

Gemini is planned to interpret teaching footage and visitor images. It proposes observations; the server constrains them with approved route knowledge and progress. Claude leads development; it is not the planned in-app recognition provider. Model confidence is not a calibrated success probability.

## Application boundaries

One Next.js/React TypeScript app. Creator/guide components consume adapters. API handlers validate requests, call `CoreAdapter` and return `Result<T>`. Executable definitions live in `contracts/contracts.ts` and `contracts/schemas.ts`; original kit definitions remain provenance. Read actual signatures before implementing callers.

Core logic lives in `src/server/core/`; provider secrets stay server-side. Voice and messaging belong in their server adapter directories when implemented. Register providers through the lead, not UI features. A missing provider flag or key must make its feature report that it is unavailable. It must never switch to synthetic data.

Local JSON persistence is a first-build choice for one Node process, unsuitable for multiple workers/serverless instances. Keep read/write failures explicit; never silently replace unreadable existing data with a fresh fixture. Add transactional shared storage when deployment requires concurrency.

## Local route media

Implemented in code gates, 2026-10-03: `POST /api/media` requires exactly one multipart entry named `file` containing a File. It checks MP4/MOV/WebM MIME and container signatures, and rejects empty files or files over 100 MB. An early Content-Length check rejects oversized declared bodies. A counted Web stream enforces the 100 MB plus 20 KiB body allowance before native multipart parsing, including absent or false length headers. Exceeding the allowance cancels the source and returns `INVALID_INPUT` before storage. Client and server share the type and size limits. No global body limit is configured; the removed Proxy buffer setting did not apply because this app has no Proxy.

`src/server/media/media.ts` stores UUID-named video and JSON metadata pairs in `BREADCRUMB_MEDIA_DIR`, or `media` beside the configured data file (normally `.data/media`). Filenames from clients are sanitized display text only. Temporary writes and rename publish metadata last; write failures return retryable provider errors and clean up partial files. This is local disk storage, not a hosted durable media service. Vercel Functions have a 4.5 MB request-body cap; hosted upload needs direct-to-storage later.

The creator previews the selected local file and reports `extraction: 'pending'` after storage. Upload does not create or change a route. Results receive focus and scroll to the viewport center to clear the mobile sticky bar. The upload panel is keyed by route id; a route switch resets its state and aborts its in-flight request on unmount. `startBuild` still reports the absent extraction provider. Earlier host checks passed the baseline HTTP and phone/desktop upload states (2026-10-03). The PR #6 repair passes core, media, typecheck and normal build checks in the sandbox. Its HTTP smoke is blocked by `listen EPERM`; fresh browser evidence is pending. Real footage, large HTTP transfers, physical phones and crash recovery remain unverified. See the [upload receipt](../archive/stages/03-build/output/media-upload.md). Next action: host HTTP/browser verification and review of the repair, then item 2b Gemini draft extraction from stored media.

## Navigation invariants

- Navigate only approved immutable versions. Existing sessions retain their version after a new publication.
- Reserve sequences centrally. Check freshness again at commit after recognition. Clients also discard obsolete responses; allow at most one camera match in flight.
- Restrict candidates using progress. A recognized landmark does not establish orientation: turns require confirmed approach evidence.
- Unknown views, unsupported observations and provider failure never create guessed turns. Uncertain/reorient/off-route show no arrow. Arrival requires destination evidence, never elapsed time.
- Locale changes preserve location and direction. Speech cancels obsolete clips and deduplicates instructions without blocking the camera.
- Input mode stays explicit through guidance, events and presentation. Production registers only `live`, and only when enabled. A mode with no recognizer fails with `PROVIDER_UNAVAILABLE`. No silent fallback.
- Validate requests and provider outputs at runtime. Captured text and model responses are data, not instructions. Any manual advancement must be visibly manual and logged.

## Camera boundary

Localhost works on this computer. A separate phone needs a reachable secure origin, permission and user activation for audio. Desktop browser checks do not establish physical-phone camera/audio behavior.

## Action-aware route steps

**Implemented, checked with test recognizers, 2026-10-03:** amendment 3 adds optional `Checkpoint.action` with kind, named target, side, target floor, ordered English/Spanish steps and completion. A spatial direction is optional for an action. Schema version remains 1. The legacy fixture and stored routes receive no fabricated actions or evidence. Approval requires complete bilingual action text and a target floor for elevators. Destinations have no action or direction.

Recognizing an action selects the active step. Repeated recognition of that step does not complete it. Observation evidence must name the action target through a case-insensitive substring match. The current/next candidate window and approach checks still apply. False approach evidence gives reorient with no arrow. Unknown or lost views retain the active action with uncertainty and no arrow. Time cannot complete an action.

Completion needs the next approved checkpoint and its own target evidence. If that next step has no action, its recorded identifying evidence must be named. The creator must approve a suitable target-floor exit checkpoint for an elevator. An entrance or button view cannot establish the target-floor landing. This uses the existing ordered route; there is no workflow engine.

`completeAction` and `POST /api/sessions/:id/complete-action` accept the pinned version, a centrally reserved fresh sequence and the active action checkpoint id. Manual completion advances one step, emits `manual_advance`, and states that the evidence is manual visitor confirmation with no visual proof. It does not emit `checkpoint_confirmed`. The next step stays uncertain with no arrow until its approach is observed. A manually reached destination reports arrived with explicit manual evidence, without a visual arrival event. In-flight older recognition still fails the commit-time sequence check.

Repair, 2026-10-03: `Session.lastConfirmedCheckpointId` remains the route progress cursor, including manual progress. Visual confirmation is tracked separately by `checkpoint_confirmed` events. The first visual confirmation after manual progress emits one event; repeated observations do not emit another for that session and checkpoint. `confirmedSessions` counts visual events only. Manual evidence is rendered from the `manual_advance` event in the current locale, with literal checkpoint labels. This also localizes old saved manual sentences when their event exists.

Creator review edits action fields and both locales of ordered steps/completion. Guide display retains target, side, floor, steps and completion. Its manual button appears only for an active action. Guidance text for speech contains the exact approved instruction and action text, literal sign/floor labels and localized side qualifiers. Locale refresh preserves position, sequence and the approved route version.

After a failed manual response and on locale refresh, the guide reads server guidance and session progress. Server progress selects the manual button even when guidance is uncertain. Reorientation toward the next checkpoint does not advance that button. A stale refresh cannot undo newer progress. If the session advances between the reads, the guide clears the older instruction.

The separate `action-fixture` draft contains B214 versus B215, Lift A to Floor 3, a target-floor landing and the right side of Rock R1. Its observations are synthetic and exist for tests only. The creator no longer offers it. It is seeded only by the test server flag (see Test doubles).

**Observed checks:** core regression checks and TypeScript pass. A supplemental Webpack build with a temporary local font response compiles the API and UI. Compiled route handlers pass direct Request/Response checks for route save/approve and manual completion. Normal build fails on the existing Google font fetch; HTTP listeners and Turbopack's font mock evaluator fail with sandbox port-binding errors. Full results and remaining checks are in the detailed-route-actions build receipt.

**Limits:** substring target matching is a route constraint, not a visual recognizer or calibrated safety measure. No real extraction, matching, field, terrain-safety, phone camera/audio or accessibility evidence is established. Approved text does not establish that a surface is traversable or climbable. Bilingual reorientation still embeds the contract's English-only approach description. Test-double checks do not satisfy the independent second-phone gate.

## Test doubles

Removed from the product, 2026-10-04: the guide's mock mode, mock panel and synthetic-observation buttons, the creator's mock badge and testing tools, the `/` default of `demo-route`, and fixture seeding of new stores. `/follow/<id>` opens the Gemini Live voice guide; `?mode=live` opens the camera check-view guide. `/` is the landing page and dashboard. `/?route=<id>` redirects to the creator at `/teach?route=<id>`; `/teach` without a route starts a new route from a video; `/routes` redirects to `/#routes`.

Kept for tests: `src/server/testing/` holds the synthetic recognizers (`mock:<checkpoint>:<kind>` media ids) and the fictional fixtures stay in `contracts/`. Unit checks inject them into `createCore`. `src/server/core/instance.ts` registers them under the `mock` mode and seeds the fixtures only when `BREADCRUMB_TEST_FIXTURES=1`. Only `scripts/isolated-server.mjs` sets this flag. Without it a new store is empty and a `mock` session returns `PROVIDER_UNAVAILABLE`. `Mode` and `ModeSchema` keep the `mock` value to avoid a contract break. Existing stores that already hold `demo-route` or `action-fixture` keep them; no migration deletes data.
