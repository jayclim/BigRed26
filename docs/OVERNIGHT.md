# Overnight run

Updated: 2026-10-03. Read `knowledge/work-protocol.md` for all working rules. The stop time is today at noon Eastern. No real route footage is available yet. Extra paid usage and deployment are not authorized.

## Before sleep

1. Put Gemini and, if available, ElevenLabs credentials in an ignored local environment file. Give the lead its path, the model/voice choice if required, and the free-tier or credit limit. Do not paste keys into chat. A key alone does not establish free usage.
2. Run `cursor-agent login`, complete browser sign-in, then check `cursor-agent status`. This host's Cursor CLI was not signed in during preflight. Confirm that paid overages are off.
3. Confirm the usage guard works before starting long work. Claude's prior stream included both usage windows; its last recorded weekly usage was 17%, which is historical evidence, not a current allowance. The lead must read a fresh event. Codex sign-in and model availability were checked.
4. Leave this Mac on power with its lid open and the controlling app running. Do not close the app, log out, shut down or switch off networking during the run.
5. Optional: authorize a private HTTPS preview if phone testing is needed. Do not deploy the current file-store design to an ephemeral host without first choosing durable storage.

No route recording is needed to implement the next code slices. After waking, supply a teaching pass, an independent follow pass and an unrelated view. A phone test and real destination match are required before calling the full navigation MVP verified.

## Bounded feature queue

| Order | Slice | Acceptance evidence |
|---|---|---|
| 0 | Publish the local baseline and add PR checks | Public repo has the reviewed baseline; CI checks a feature PR. |
| 1 | Guard unattended runs | Fresh usage is parsed; missing usage, thresholds, deadline and blocked states stop dispatch; no duplicate worker jobs. |
| 2 | Teach a route from uploaded media | Bounded input validation and storage, editable extraction draft, useful errors. Use official APIs and existing contracts. |
| 3 | Gemini draft extraction | Structured checkpoint output is validated and stays unapproved until human review. Record real provider response separately from synthetic fixture checks. |
| 4 | Live frame matching | Approved route context, bounded frame rate, stale-response rejection, unknown/reorient states, no unsupported turn or arrival. |
| 5 | ElevenLabs voice | Exact approved text, cached output, mute/locale controls and recoverable errors. Browser speech remains an explicit fallback. |
| 6 | Complete the app flow | Teach, review, approve, share, follow, recover and arrive; responsive visual review and accessibility checks. |
| 7 | Final evidence and handoff | Passing CI, honest feature status, remaining device checks, setup instructions and demo script. |

Split a slice when it no longer fits one reviewable PR. Dependency order governs the queue. Work on the next independent slice if credentials are missing. Do not add Photon, analytics, native glasses support or space features before the core app works.

## Claude start prompt

Paste this into a fresh Claude Code session in the project directory:

> Use the local orchestrator skill. Read AGENTS.md, PROGRESS.md, knowledge/work-protocol.md and docs/OVERNIGHT.md. You are the lead. Use the official Codex plugin and codex:codex-rescue to implement with --model gpt-6.1-sol --fresh. Leave reasoning effort unset. Check existing plugin jobs and PRs before dispatch. Use one implementer, a separate reviewer and one named merger. Follow the iterative PR procedure and update knowledge in every change. Use Cursor for useful independent review once signed in. Work only on the bounded MVP queue until noon Eastern on October 3, 2026. Stop new Claude dispatch at 55% weekly use and never bypass the 60% ceiling, unknown usage, paid usage or missing permissions. First verify the usage guard and a small plugin task. Do not create an unlimited loop. Save a short handoff at each checkpoint. No real footage exists yet, so preserve the unverified real-device gate.

Each fresh handoff needs only: active feature, owner/role, branch/worktree, base and latest commits, PR, changed paths, checks, decisions, blockers, running job IDs and next action. Keep raw logs in ignored `.overnight/`; do not copy transcripts into the project brain.

## Hardware and Cursor

The Ray-Ban Meta Gen 2 glasses can supply route recordings later. Direct live integration requires a native iOS/Android companion using Meta's Device Access Toolkit. It is outside this web MVP's critical path. Do not assume the display-only web-app path applies to Wayfarer Gen 2 glasses. See the [Meta FAQ](https://developers.meta.com/wearables/faq/).

Cursor should do real work: inspect a PR, find UX defects, verify an error path or improve an assigned screen. Record the resulting changes and evidence. Usage alone does not establish prize eligibility. The supplied kit describes a SpaceX track with additional space-data and Grok requirements; its current rules still need confirmation from the organizer. Do not redirect the app only to spend quota.

## Current launch state

Workflow preparation is in progress. No recurring overnight run is claimed to be active by this document. The latest observed launch and guard results belong in `PROGRESS.md`.
