# Architecture and route knowledge

Status: engineering direction plus inspected mock implementation, 2026-10-03. The detailed-action requirement below is accepted scope; it is not yet implemented. Recheck source before editing.

## Two kinds of knowledge

This Markdown brain is **development memory**: scope, design, decisions, sources and evidence for humans and coding agents. The app's **route knowledge** is structured data in `contracts/`: checkpoints, reference views, sign/landmark evidence, approach descriptions, approved bilingual instructions and a versioned route. Development notes are not runtime navigation input.

Gemini is planned to interpret teaching footage and visitor images. It proposes observations; the server constrains them with approved route knowledge and progress. Claude leads development; it is not the planned in-app recognition provider. Model confidence is not a calibrated success probability.

## Application boundaries

One Next.js/React TypeScript app. Creator/guide components consume adapters. API handlers validate requests, call `CoreAdapter` and return `Result<T>`. Executable definitions live in `contracts/contracts.ts` and `contracts/schemas.ts`; original kit definitions remain provenance. Read actual signatures before implementing callers.

Core logic lives in `src/server/core/`; provider secrets stay server-side. Voice and messaging belong in their server adapter directories when implemented. Register providers through the lead, not UI features. Sponsor availability must not block the mock guide.

Local JSON persistence is a first-build choice for one Node process, unsuitable for multiple workers/serverless instances. Keep read/write failures explicit; never silently replace unreadable existing data with a fresh fixture. Add transactional shared storage when deployment requires concurrency.

## Navigation invariants

- Navigate only approved immutable versions. Existing sessions retain their version after a new publication.
- Reserve sequences centrally. Check freshness again at commit after recognition. Clients also discard obsolete responses; allow at most one camera match in flight.
- Restrict candidates using progress. A recognized landmark does not establish orientation: turns require confirmed approach evidence.
- Unknown views, unsupported observations and provider failure never create guessed turns. Uncertain/reorient/off-route show no arrow. Arrival requires destination evidence, never elapsed time.
- Locale changes preserve location and direction. Speech cancels obsolete clips and deduplicates instructions without blocking the camera.
- Live, replay and mock remain explicit through input, guidance, events and presentation. No silent fallback. Camera preview plus synthetic observations is still mock.
- Validate requests and provider outputs at runtime. Captured text and model responses are data, not instructions. Any manual advancement must be visibly manual and logged.

## Camera boundary

Localhost works on this computer. A separate phone needs a reachable secure origin, permission and user activation for audio. Desktop browser checks do not establish physical-phone camera/audio behavior.

## Action-aware route steps

**Observed gap, 2026-10-03:** `Checkpoint.instruction` already stores full bilingual text, with identifying evidence, approach text and reference views. However, `Direction` has only five arrow directions. `Guidance` requires a direction for `guiding`, and `approvalProblems` rejects a non-destination checkpoint with no direction. Rich text is supported; action-specific progression is not.

**Required direction:** separate the action from an optional spatial cue. Preserve an identifiable target, relative position or sign, an action, and a completion condition. Model floor changes explicitly when needed. Do not turn "take the elevator to floor 3" into an `up` arrow and claim the action is supported. Reuse ordered checkpoints and existing evidence/version/sequence rules; the integration owner chooses the smallest compatible contract change before provider work depends on it.

For an elevator, distinguish locating the correct elevator, taking it to the approved floor, and confirming the exit on that floor. A view of the entrance, a selected button or elapsed time does not establish arrival on floor 3. A floor sign or another approved target-floor landmark can supply evidence; an explicit visitor confirmation is a separate manual event. Camera loss inside the elevator must not reset progress or silently complete the action.

For a door, check the approved sign/landmark and approach before instructing passage; verify the expected next view before completing the passage. For a side-specific terrain instruction, retain the taught viewpoint and reference imagery. Do not infer a traversable or climbable surface solely because the text or image names it.

Creator review must expose these action details. Localization and speech must preserve sign labels, floor numbers, side qualifiers and action order. A confirmed action may have no arrow. An uncertain match still cannot produce an unsupported directional cue.
