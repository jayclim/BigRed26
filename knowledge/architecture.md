# Architecture and route knowledge

Status: engineering direction plus inspected initial implementation, 2026-10-03. Recheck source before editing; the first build is active.

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
