# Detailed route actions — queue item 1a

Date: 2026-10-03. Status: implementation complete in mock/code gates; repair delta independently reviewed clean (2026-10-03); live/physical gate pending. Branch: `feat/detailed-route-actions`. Repair base: `5af4c0302508e2a34aa709a8f6bc1aab7521218b`.

## Scope and implemented slice

The original slice adds optional checkpoint actions, bilingual steps and completion, action approval, a manual endpoint, creator editing and guide display. Amendment 3 keeps schema version 1. The legacy fixture remains unchanged. The separate `action-fixture` uses synthetic B214/B215, Lift A, Floor 3 and Rock R1 observations. It remains mock evidence.

Recognition selects an action. Repeated entrance/button views and elapsed time do not complete it. The next approved checkpoint needs its own evidence and approach. Manual completion advances one step with `manual_advance`, no visual event and no next-step arrow. Approved versions, central sequences and commit-time stale rejection remain in use.

The bounded repair changes only assigned guide/core files, the four dispatch instruction files, architecture, progress and this receipt. It adds no dependency or public contract. It does not change guard thresholds, deadline, permission mode, lock or process logic. The worker made no commit, push, merge, deployment, reset or provider call. Root environment files were not edited. Claude lead `cdfe9f32` committed and pushed the verified diff without new code.

## Repair decisions

1. After a failed manual response and on locale refresh, the guide reads current guidance, then actual session progress. The small pure `reconcileGuide` function selects the active checkpoint from the server session, including uncertain manual guidance. It rejects stale progress and clears an older instruction if progress changes between reads. Locale and navigation requests share the existing in-flight guard.
2. The existing session cursor remains route progress. The existing `checkpoint_confirmed` event log tracks visual confirmation separately. First visual recognition after manual progress emits exactly one confirmation for that session and checkpoint. Repeated or duplicate observations cannot add another. `confirmedSessions` still counts visual events only.
3. Manual evidence is rendered from the `manual_advance` event in the current English or Spanish locale. Checkpoint labels stay literal. Old saved English manual sentences also refresh in Spanish when their event exists. No other localization was added.

The existing core check now commits B214 before returning a simulated lost response. It exercises the same pure reconciliation function used by the guide, recovers Lift A despite uncertain guidance and completes that recovered action. It also checks reorientation without progress, stale/mismatched snapshots, first visual confirmation, event and quality counts, repeat/duplicate observations and English/Spanish refresh of old manual evidence. This is a core/guide reconciliation regression, not a browser transport test.

## Actual repair checks

Repair worker: lead `32a7b9ab`, native foreground [SOL] rescue on gpt-6.1-sol. The handback reported `Selected model is at capacity` after the worker left a partial diff. The task did not succeed as a worker run. The lead inspected the diff and ran the host checks below.

Host checks, Claude lead `32a7b9ab`, 2026-10-03 about 08:56Z, on the exact repaired application diff (raw logs `.overnight/actions-repair-checks-32a7b9ab.log` and `.overnight/actions-repair-smoke-32a7b9ab.log`, not committed):

| Command | Result |
|---|---|
| `npm run check` | Pass, including lost-response reconciliation, visual confirmation after manual progress and bilingual manual evidence. |
| `npm run typecheck` | Pass. |
| `node scripts/claude-run.check.mjs` | 31 pass, 0 fail. |
| `npm run build` | Pass, normal Turbopack build. |
| `node scripts/smoke-api.mjs` (isolated server on port 3143, temporary store) | `smoke passed`, including `complete-action` 400/409 rejections and 200 manual progress. |
| `git diff --check` | Pass. |

Host HTTP smoke supersedes the worker's listener EPERM below. Lead `cdfe9f32` changed only knowledge text after these checks and did not repeat the full suites.

Worker sandbox results, superseded where noted. Environment: worker sandbox, Node 24.11.1, Next.js 16.3.8. Test state uses isolated temporary data.

| Command | Result |
|---|---|
| `npm run check` | Exit 0. Existing checks and all repair regressions pass. |
| `npm run typecheck` | Exit 0. No diagnostics on the final code. |
| `node scripts/claude-run.check.mjs` | Exit 0. All 31 offline tests pass; none skipped. |
| `npm run build` | Exit 0. Normal Turbopack production build passes on the final code. |
| `node scripts/smoke-api.mjs 3141` | Exit 1 before any HTTP request (superseded by host pass). Isolated server cannot bind: `Error: listen EPERM: operation not permitted 0.0.0.0:3141`. The helper reports `Error: next start exited (1). Is port 3141 free and the app built?` |
| `git diff --check` | Exit 0. No whitespace diagnostics. |

An intermediate core/typecheck/build run failed because a local `state` variable shadowed the event store: `ReferenceError: Cannot access 'state' before initialization`, with TypeScript TS2448/TS2454. It was renamed to `guidanceState`. The final core, typecheck and production build pass. No build workaround or configuration change was used for this repair.

## Prior evidence and dispatch correction

Prior host evidence, recorded by Claude lead `5d1040e8` on 2026-10-03: lead `7fe84ded` passed core, typecheck and the normal build. Lead `5d1040e8` inspected the smoke diff and passed `node scripts/smoke-api.mjs 3131` against isolated storage. The smoke covered the legacy flow, inactive/wrong-version/duplicate manual requests, B215 rejection and valid B214 manual progress. Prior renders at 1280×900 and 390×844 showed the creator and guide, no horizontal overflow and visible keyboard focus. These checks precede the repair and do not verify its rendered recovery behavior.

Initial worker history: core/typecheck passed; the normal build was blocked by Google font fetch, HTTP smoke by listener EPERM, and staging by an out-of-root Git index lock. A temporary-font Webpack build and direct compiled Request/Response handler checks passed. Later host checks superseded those build and publication limits. Full terminal transcripts were removed from this receipt.

The instruction text now requires native `run_in_background:false` explicitly; never true or omitted on this host, where omission defaults to async. Source: controller/Claude runtime evidence supplied with this repair, 2026-10-03. Two explicit-false foreground rescue successes were observed: lead `68f3867f` operator implementation and lead `48d54cf6` independent review. Lead `5d1040e8` was host-only PR publication, not a rescue. This repair (lead `32a7b9ab`) got an explicit-false native handback that reported model capacity failure, not task success. In lead `7fe84ded`, omission accepted job `task-mus4cgwi-jz3pwa` but produced no native handback. This is controller/Claude evidence, not a human claim. The prompt expectation checks the corrected text.

## Limits and next action

Browser captures are pre-repair. No rendered phone/desktop recovery run was made. The lost-response regression is a core/helper check, not a browser transport-fault test. If both refresh reads fail, the client cannot know whether the server committed; it shows the failure and requires a later successful refresh. Old manual decisions need their existing `manual_advance` event to regenerate localized evidence. Local JSON storage remains limited to one process. English-only approach descriptions remain a separate localization limit.

No real recognition, physical completion, terrain safety, accessibility or phone camera/audio gate is established. The lead's untracked `.overnight/*.log` and `.overnight/ui-actions/` PNGs are raw artifacts for merger cleanup. They are not knowledge and must stay out of Git. They were not present in this repair worktree and were not changed.

## Repair-delta review

Reviewer: fresh native `codex:codex-rescue` [SOL], gpt-6.1-sol, `--fresh --wait`, foreground (lead `ca55cd2a`, agent `a2d1adb873a2f70be`), read-only, delta `5af4c03..1347c12` at head `1347c12`. Result: no blocking findings. Findings 1-3 repaired; guard change is prompt text and its assertion only, limits unchanged. Reviewer checks (actual, Node 24): typecheck, in-memory core assertions with repair regressions, a custom GuideScreen callback harness (lost reply, refresh failures/races, button removal, locale refresh, visual arrival), guard usage-boundary assertions, `git diff --check`. Hosted CI run 37111894393 passed on `1347c12`. Non-blocking: `GuideScreen.tsx:114` keeps the stale manual button if the session read fails while guidance succeeds; reservation and locale-update failures return before reconciliation. A later successful refresh repairs it. Not run: browser transport-fault test, reviewer HTTP/build.

Next: live/physical gate needs route footage and phone test. Next queue item: 2 (teach a route from uploaded media).
