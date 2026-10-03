# Agent work protocol

Status: user decision, 2026-10-03. This is the canonical source for role and model routing in this project. Use Simplified Technical English: short sentences, concrete verbs and consistent terms. Do not claim formal ASD-STE100 compliance.

## Roles

| Role | Owner | Authority |
|---|---|---|
| Lead | Claude Code | Choose scope, architecture, task order and acceptance criteria. Maintain the work queue. |
| Controller | Codex chat controller | Supervise at high level: wake-up, usage and convention checks. Claude retains direction and integration. |
| Implementer | Codex, routed below through Claude's official Codex plugin | Change assigned files in one feature branch. Test, commit, push and open a PR. |
| Reviewer | A separate fresh session; Cursor is a useful independent reviewer when it fits | Check the exact PR commit and run relevant checks. Report defects with evidence. Cursor is not required on every PR and does not change the Codex implementation path. Cursor sign-in alone does not verify spending limits. |
| Merger | One named Claude Code integration session | Reconcile knowledge, check the current PR commit and merge. Claude Code is the sole merger. No other worker merges. |

Use one implementer at a time by default. Do not start unnecessary parallel workers. Use two only for independent tasks with disjoint files when the split reduces work. Keep delegation one level deep. Review and merger are roles; do not keep idle agents running. These are shared-account procedures, not separate GitHub access controls.

Read both the project [operator](../skills/operator/SKILL.md) and [orchestrator](../skills/orchestrator/SKILL.md) skills for all work. The user's model choices override older skill defaults, including Terra and Sonnet. Do not use Claude implementers. Workers follow their bounded assignment; they do not start another team. Each worker must know that others share the project and must preserve their changes. Human file ownership remains in `docs/TEAM-HANDOFF.md`; the lead must assign those paths before concurrent work starts.

## Model routing and dispatch

| Model | Assigned work |
|---|---|
| `gpt-6-luna` | Well-defined, low-risk mechanical work. |
| `gpt-6.1-sol` | Substantive or coupled work, design-sensitive work, debugging, or important review. |

Leave effort unset. Use `[LUNA]` or `[SOL]` task labels. Give the worker a self-contained contract: objective, context, owned paths, invariants, exclusions, acceptance checks and required evidence. Do not silently substitute a model. Record observed model support and the runtime used.

Authorization: the user chose both models on 2026-10-03. Observed runtime evidence, 2026-10-03: gpt-6.1-sol succeeded on Codex 0.159.2 in controller, Claude lead and official plugin runs (latest rescue thread `01a100c8-4dfd-7fe2-9ed0-b921c5b12d2e`). native gpt-6-luna handback observed for job task-mus79spc-ehkwyv (host-verified .gitignore repair, 2026-10-03). Authorization alone does not establish model support.

Lead model: the Claude lead must run as Opus 5.5 with the exact observed model `claude-opus-5-5` (user decision, 2026-10-03). The controller checks the init model at each launch. A different or missing model stops the run; there is no silent fallback. Do not edit global settings to force the model. Observed 2026-10-03: the existing global setting and recent init events already use Opus 5.5.

Publication: push every created commit at each checkpoint. When the worker sandbox blocks Git, the Claude host commits and pushes. After each push, verify that the local and remote branch SHAs are equal, and report any push failure. Observed 2026-10-03 09:48Z by the controller: all 7 local branches matched origin, with no unpushed commits.

Implementation runs only through Claude Code's native `Agent(subagent_type="codex:codex-rescue")` with the official Codex plugin. Dispatch in the foreground with `--fresh --wait --model <model>`. Pass native `run_in_background:false` explicitly; never true or omitted on this host (omission defaults to async). Do not use `--background`. The rescue subagent only forwards the task. The native Agent result is completion; do not poll a live rescue or dispatch status/result collectors. Never bypass the plugin with a direct Codex CLI task.

Observed controller/Claude evidence, 2026-10-03: explicit-false foreground rescue succeeded twice, in lead `68f3867f` (operator implementation) and lead `48d54cf6` (independent review). Lead `5d1040e8` was host-only PR publication, not a rescue. Lead `32a7b9ab` got a native foreground handback with explicit false, but the task failed: `Selected model is at capacity`. A handback is not task success. Lead `7fe84ded` omitted the field: job `task-mus4cgwi-jz3pwa` was accepted, but no native handback arrived. These are runtime observations, not a human claim.

A returned background ID or an empty result is a failed handoff. A background ID is also an enforcement failure. Stop new dispatch, preserve work and save recovery information: task, worktree, commit, owned job/session IDs, result and next safe action. Do not poll the failed handoff or retry blindly. Inspect owned jobs for recovery before any later dispatch.

A tool-level Agent allowlist is unverified. Do not claim that it is enforced. Obey the rescue-only delegation boundary anyway; do not substitute another Agent type.

## One feature cycle

1. Read `AGENTS.md`, `PROGRESS.md` and the selected stage. Inspect the current branch, diff and active PRs. Resume incomplete work before starting another feature.
2. Save a short task packet: objective, base commit, branch, owned files, dependencies, acceptance checks and explicit limits. Assign shared contracts/configuration to one worker. Define one user-visible result.
3. Use a separate Git worktree for a concurrent worker. Branch from current `origin/main`. Use `feat/<short-name>` or `fix/<short-name>`. Never have two writers in one checkout.
4. Reuse existing code, native APIs, installed packages and licensed assets. Add a dependency only when it removes substantial work. Keep product code modular around real boundaries; avoid generic frameworks, pass-through wrappers and speculative options.
5. Implement a small complete slice. Run meaningful tests for its behavior. Keep secrets, footage, local data, logs and private settings out of Git.
6. Update knowledge in the same change. Record behavior, decisions, checks, limits and next action in a named stage output. Update the relevant canonical reference when a lasting fact changes. Do not pad docs for a trivial edit; a brief evidence receipt is enough.
7. Review the exact diff. Commit each verified step with a clear verb. Stage explicit paths. Push the feature branch at each checkpoint. Open or update its PR with the problem, resulting behavior, test evidence and knowledge link.
8. The reviewer checks the current commit. The implementer fixes findings on the same branch. A changed commit invalidates earlier passing evidence when the changed behavior was covered by it.
9. The sole merger checks conflicts, required CI, review findings, secret exposure, knowledge and the scope. Re-run affected checks after conflict resolution. Merge without an admin bypass. Use squash merge unless preserving individual commits helps review. Never force-push `main`.
10. The merger updates `PROGRESS.md` before merge, then confirms the merged commit and CI. Save a compact handoff. Start the next bounded feature in a fresh worker session.

The first publication into the empty repository is a baseline commit. All later feature work uses PRs. Do not discard, reset or clean another person's work. Use a follow-up fix to repair published history.

## Checks

For code changes: `npm run check`, `npm run typecheck`, `npm run build`. For HTTP/state changes: also `node scripts/smoke-api.mjs`. For test-server changes: `node scripts/isolated-server.check.mjs`. For UI changes: inspect affected phone and desktop states, keyboard focus and error recovery. Existing scripts use temporary data; never run `npm run reset` as a test step.

Do not repeat a full test suite on unchanged code. Do not add tests which only repeat implementation details. Provider success, a camera preview and a synthetic replay are separate evidence. Only real route evidence can establish the physical navigation gate.

## Context and skills

Use bounded fresh Codex sessions per feature with `--fresh`. Fresh worker sessions are ephemeral here: `--resume-last` failed with a missing rollout. Reuse a session for fixes only when the runtime confirms that it exists. Otherwise use the saved compact handoff and a fresh worker. A fresh Claude lead session reads the saved task packet and current progress; it must check for active plugin jobs before dispatch. A fresh chat alone does not guarantee lower cost. Small task packets and selective reads reduce repeated context.

Keep canonical project skills in `skills/`. Discover them through `.claude/skills/`, `.agents/skills/` and `.cursor/skills/`. Before installing another skill, check what is already present. Prefer the official publisher. Read its instructions and scripts, check source/license, and install only what the active task needs. Record source and version. Do not import large skill collections.

Follow the model routing and foreground dispatch rules above. Supervise with evidence: inspect the native result, diff and actual checks against the worker contract. Use a separate reviewer for the exact commit before the sole merger integrates.

## Overnight limits

This run ends at **2026-10-03 12:00 America/New_York** (16:00 UTC), or earlier when the bounded MVP work is complete or the user asks to stop.

- Default extra spend: **$0**. Use included subscriptions, verified free tiers or credits protected by a hard limit. Do not enable overages, buy credits, change plans or redeem account reset credits.
- Claude weekly ceiling: **60% used**. Stop new dispatch at **55%** to leave a buffer. A session reset does not reset weekly usage. A request already in flight and usage elsewhere on the account can cross a threshold; do not promise a precise hard cap.
- Read actual five-hour and seven-day utilization and reset times. Missing, invalid or stale data means pause. Never interpret a missing value as zero. Pause on rate-limit or billing errors; do not retry in a tight loop. Recheck after the reported reset only if the weekly gate and deadline permit.
- Stop the current bounded run if monitored usage reaches the dispatch threshold. Save the last verified checkpoint; never merge incomplete work. Check plugin jobs separately because a background worker can outlive the lead.
- Keep the Mac on AC power, lid open, Internet connected and the controlling app running. Use `caffeinate` for this run only. Do not change system-wide power settings.
- Deployment is pending a separate user decision. Local development and GitHub branches/PRs/merges are authorized. Do not publish API keys or private footage to the public repository.

If work is blocked, complete independent work and record the exact missing input. Stop on repeated unchanged blockers. Do not add unrelated features to consume a subscription.
