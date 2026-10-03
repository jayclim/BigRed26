# Breadcrumb: three-person build

Promise: record a route once, then help the next visitor follow it through their camera. The first audience is an event host sending visitors to a room inside an unfamiliar building.

Claude Code led the initial local build in session `93ecef95-52b5-4b04-9921-a843756f4f8b`. The current multi-agent procedure is in [the work protocol](../knowledge/work-protocol.md); fresh sessions start from [the overnight handoff](OVERNIGHT.md). Resume the old session only when its context is needed:

```sh
claude --resume 93ecef95-52b5-4b04-9921-a843756f4f8b
```

## Build order

1. This computer, led by Claude Code: one local mock MVP with route review, approval, sessions, guidance states and bilingual instructions. Establish the shared contracts and runnable baseline before parallel human work.
2. Integration owner: use one real 45–90 second route video to build an editable Gemini checkpoint draft. Match an independent second-phone pass; unknown scenes and unknown orientation must suppress turns. Prove a real destination match.
3. Teammate A polishes the creator and visitor flow while teammate B adds ElevenLabs and captures the actual demo evidence. Integrate their changes into the same app.
4. Only after the real route works: consider Photon photo help and checkpoint analytics. No sponsor extension should delay the core demo.

The initial mock MVP proves interaction and state handling. It does not prove visual recognition, reliable navigation, spatial AR or sponsor integration.

## You + Claude: core and integration

Own `src/server/core/**`, `src/app/api/**` (or the actual equivalent selected for this app), `contracts/**`, root package/lock/config, app mounting, storage and deployment. Claude makes architecture and integration decisions. You supply credentials through local environment configuration, confirm the real route's directions and accept the real-device evidence.

The baseline now uses Next.js App Router (`src/app/api/**` literally) and one-process JSON persistence. Read `AGENTS.md` first, then the task's context. Current adapter amendments are in `contracts/AMENDMENTS.md`: approval also takes reviewed checkpoint IDs, and `currentGuidance(sessionId)` refreshes localized text without advancing. Use these implemented contracts, not the original kit's earlier signatures. Reuse guidance and installed tools are cataloged in `knowledge/reuse.md`.

Keep the shared kit's `CoreAdapter` boundary. Freeze the implemented v1 contracts after the local baseline; coordinate any later change with both people. Claude may scaffold their UI directories for the initial baseline, but once assignments begin each person owns the paths below. Make a shared repository available before they start; no repository or remote existed when the zip was unpacked.

## Person 1: interface and real-device checks

Send them `breadcrumb-kit/prompt-interface.txt`, `contracts/`, the runnable baseline and this file.

Own `src/features/creator/**`, `src/features/guide/**`, `src/features/quality/**`, `src/ui/**` and feature-local fixtures. Use the actual component signatures documented in `docs/CLAUDE-HANDOFF.md`. Keep UI dependent on adapters; do not call Gemini directly.

First assignment: improve the existing create/review → approve/share → follow → arrive flow, keeping every mock state working. Cover loading, failure, camera permission denial, uncertainty, reorientation, arrival, language and sound controls. Capture phone-width screenshots. No arrow for uncertainty or unconfirmed orientation; no timer-driven advancement.

Baseline exports: `CreatorScreen({core, routeId, followPath})` and `GuideScreen({core, routeId, exitHref})`. `Camera.tsx` is yours too. `QualityScreen` is not built. Extend existing components and `src/ui/theme.css`; follow `skills/breadcrumb-design/SKILL.md` for visual review.

Next assignment: test the real camera/voice on the second phone, confirm permission and playback recovery, and capture an actual route completion plus an unrelated view. Report observed behavior; do not invent accuracy or completion statistics.

Done when: the screens work with the supplied adapter, fit a portrait phone, support keyboard focus/captions/mute, and a screenshot plus run command accompanies the handoff. Request shared dependencies from Claude; do not edit the lockfile, root layout or contracts independently.

## Person 2: voice, route capture and demonstration

Send them `breadcrumb-kit/prompt-integrations.txt`, `breadcrumb-kit/judging.txt`, `contracts/`, the runnable baseline and this file.

Own `src/server/voice/**`, `src/server/messaging/**`, `src/demo/**` and presentation assets. Start with **ElevenLabs TTS and the physical route evidence**, not messaging or analytics.

First assignment: record the teaching route with clear signs, turns and destination, then collect an independent second-phone pass and one unrelated view. Avoid capturing bystanders unnecessarily. Supply actual files and approved checkpoint directions to Claude. Implement `VoiceAdapter.synthesize` using exact approved text; cache by text, locale and voice; return recoverable provider errors. Keep keys server-side and have Claude register the endpoint.

Next assignment: prove audible English and Spanish output on the target phone, prepare an honestly labeled replay input, record 45–60 seconds of the functioning app, then create the five-slide presentation from actual screenshots. Follow `judging.txt`; verify event dates/rules before submission because the kit's claims have not been independently rechecked here.

The current guide uses explicitly labeled browser speech. `/api/speech` is not registered yet. Replay should implement the exported `Recognizer` and be registered by the lead as `recognizers.replay` in `src/server/core/instance.ts`; it is separate from a synthetic UI fixture.

Done when: real ElevenLabs audio is heard, failure does not block navigation, footage is organized, and the handoff contains owned files, environment variable names, run command, evidence and remaining gaps. Photon is optional after one real opted-in photo round trip is possible; nobody has authorization here to send messages to others.

## Shared working rules

- One branch per bounded feature. Use the shared work protocol for PRs, the sole merger, evidence and knowledge updates. Only the assigned integration worker edits shared config/contracts.
- Keep live, replay and mock visibly distinct. Do not describe recorded output or mock selectors as live recognition.
- Approved routes are versioned; active sessions keep their version. Locale changes preserve location. Browser and messaging share sequence allocation.
- API credentials stay in ignored environment files, never chat, frontend bundles or screenshots.
- This computer can use localhost for development. A different phone needs a reachable HTTPS origin for camera access; deployment and device checks are a later explicit step.

Final integration gate: a different phone completes the real short route; an unrelated view produces uncertainty; wrong-facing evidence removes the arrow; arrival needs destination evidence; language changes preserve position; slow/failed providers leave controls responsive.
