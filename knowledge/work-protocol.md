# Agent work protocol

Status: user decision, 2026-10-03. This is the shared procedure for this project. Use Simplified Technical English: short sentences, concrete verbs and consistent terms. Do not claim formal ASD-STE100 compliance.

## Roles

| Role | Owner | Authority |
|---|---|---|
| Lead | Claude Code | Choose scope, architecture, task order and acceptance criteria. Maintain the work queue. |
| Implementer | Codex `gpt-6.1-sol`, called through Claude's official Codex plugin | Change assigned files in one feature branch. Test, commit, push and open a PR. |
| Reviewer | A separate fresh session; Cursor when signed in | Inspect the diff and run relevant checks. Report defects with evidence. |
| Merger | One named integration session under Claude | Reconcile knowledge, check the current PR commit and merge. No other worker merges. |

Use one implementer at a time by default. Use two only for independent tasks with disjoint files. Keep delegation one level deep. Review and merger are roles; do not keep idle agents running. These are shared-account procedures, not separate GitHub access controls.

Read the project `orchestrator` skill for all work. Workers follow their bounded assignment; they do not start another team. Each worker must know that others share the project and must preserve their changes. Human file ownership remains in `docs/TEAM-HANDOFF.md`; the lead must assign those paths before concurrent work starts.

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

Use fresh Codex sessions per feature with `--fresh`. Reuse that session for fixes to the same feature. A fresh Claude lead session reads the saved task packet and current progress; it must check for active plugin jobs before dispatch. A fresh chat alone does not guarantee lower cost. Small task packets and selective reads reduce repeated context.

Keep canonical project skills in `skills/`. Discover them through `.claude/skills/`, `.agents/skills/` and `.cursor/skills/`. Before installing another skill, check what is already present. Prefer the official publisher. Read its instructions and scripts, check source/license, and install only what the active task needs. Record source and version. Do not import large skill collections.

Claude must delegate coding with `codex:codex-rescue` and the official runtime. Pass `--model gpt-6.1-sol`; leave effort unset unless the user selects it. The rescue subagent only forwards the task. Claude monitors through the plugin's status/result commands. Never silently switch model or bypass the plugin with a direct Codex CLI task. An empty result is a failure, not completion.

## Overnight limits

This run ends at **2026-10-03 12:00 America/New_York** (16:00 UTC), or earlier when the bounded MVP work is complete or the user asks to stop.

- Default extra spend: **$0**. Use included subscriptions, verified free tiers or credits protected by a hard limit. Do not enable overages, buy credits, change plans or redeem account reset credits.
- Claude weekly ceiling: **60% used**. Stop new dispatch at **55%** to leave a buffer. A session reset does not reset weekly usage. A request already in flight and usage elsewhere on the account can cross a threshold; do not promise a precise hard cap.
- Read actual five-hour and seven-day utilization and reset times. Missing, invalid or stale data means pause. Never interpret a missing value as zero. Pause on rate-limit or billing errors; do not retry in a tight loop. Recheck after the reported reset only if the weekly gate and deadline permit.
- Stop the current bounded run if monitored usage reaches the dispatch threshold. Save the last verified checkpoint; never merge incomplete work. Check plugin jobs separately because a background worker can outlive the lead.
- Keep the Mac on AC power, lid open, Internet connected and the controlling app running. Use `caffeinate` for this run only. Do not change system-wide power settings.
- Deployment is pending a separate user decision. Local development and GitHub branches/PRs/merges are authorized. Do not publish API keys or private footage to the public repository.

If work is blocked, complete independent work and record the exact missing input. Stop on repeated unchanged blockers. Do not add unrelated features to consume a subscription.
