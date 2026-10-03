# Overnight run

Updated: 2026-10-03. Read `knowledge/work-protocol.md` for all working rules. The stop time is today at noon Eastern. No real route footage is available yet. Extra paid usage and deployment are not authorized.

## Before sleep

1. Put Gemini and, if available, ElevenLabs credentials in an ignored local environment file. Give the lead its path, the model/voice choice if required, and the free-tier or credit limit. Do not paste keys into chat. A key alone does not establish free usage.
2. Run `cursor-agent login`, complete browser sign-in, then check `cursor-agent status`. This host's Cursor CLI was not signed in during preflight. Confirm that paid overages are off.
3. Use the bounded guard below. Its fake-process checks pass. A live probe and official-plugin task are still unverified. Claude's prior 17% weekly observation is historical evidence, not a current allowance. Codex sign-in and model availability were checked.
4. Leave this Mac on power with its lid open and the controlling app running. Do not close the app, log out, shut down or switch off networking during the run.
5. Optional: authorize a private HTTPS preview if phone testing is needed. Do not deploy the current file-store design to an ephemeral host without first choosing durable storage.

No route recording is needed to implement the next code slices. After waking, supply a teaching pass, an independent follow pass and an unrelated view. A phone test and real destination match are required before calling the full navigation MVP verified.

## Bounded feature queue

| Order | Slice | Acceptance evidence |
|---|---|---|
| 0 | Publish the local baseline and add PR checks | Public repo has the reviewed baseline; CI checks a feature PR. |
| 1 | Guard unattended runs | Controller and fake-process checks are complete. Next: fresh live telemetry and one bounded official-plugin task. The lock covers controller runs; plugin job recovery needs a separate check. |
| 2 | Teach a route from uploaded media | Bounded input validation and storage, editable extraction draft, useful errors. Use official APIs and existing contracts. |
| 3 | Gemini draft extraction | Structured checkpoint output is validated and stays unapproved until human review. Record real provider response separately from synthetic fixture checks. |
| 4 | Live frame matching | Approved route context, bounded frame rate, stale-response rejection, unknown/reorient states, no unsupported turn or arrival. |
| 5 | ElevenLabs voice | Exact approved text, cached output, mute/locale controls and recoverable errors. Browser speech remains an explicit fallback. |
| 6 | Complete the app flow | Teach, review, approve, share, follow, recover and arrive; responsive visual review and accessibility checks. |
| 7 | Final evidence and handoff | Passing CI, honest feature status, remaining device checks, setup instructions and demo script. |

Split a slice when it no longer fits one reviewable PR. Dependency order governs the queue. Work on the next independent slice if credentials are missing. Do not add Photon, analytics, native glasses support or space features before the core app works.

## Claude start prompt

Save this as a prompt file and launch it with the guard below:

> Use the local orchestrator skill. Read AGENTS.md, PROGRESS.md, knowledge/work-protocol.md and docs/OVERNIGHT.md. You are the lead. Use the official Codex plugin and codex:codex-rescue to implement with --model gpt-6.1-sol --fresh. Leave reasoning effort unset. Check existing plugin jobs and PRs before dispatch. Use one implementer, a separate reviewer and one named merger. Follow the iterative PR procedure and update knowledge in every change. Use Cursor for useful independent review once signed in. Work only on the bounded MVP queue until noon Eastern on October 3, 2026. Stop new Claude dispatch at 55% weekly use and never bypass the 60% ceiling, unknown usage, paid usage or missing permissions. First verify the usage guard and a small plugin task. Do not create an unlimited loop. Save a short handoff at each checkpoint. No real footage exists yet, so preserve the unverified real-device gate.

Each fresh handoff needs only: active feature, owner/role, branch/worktree, base and latest commits, PR, changed paths, checks, decisions, blockers, running job IDs and next action. Keep raw logs in ignored `.overnight/`; do not copy transcripts into the project brain.

## One guarded launch

Run from the assigned worktree. Use Node 24. This controller launches one fresh Claude lead. It has no scheduler or automatic retry.

```sh
cd "/Users/jaydenl/Dev/Hackathon/BigRed 2026/.worktrees/overnight-guard"
export PATH="/Users/jaydenl/.nvm/versions/node/v24.11.1/bin:$PATH"
node scripts/claude-run.check.mjs
node scripts/claude-run.mjs check
```

`check` makes no model call. It checks saved usage and CLI support. Missing usage blocks it. When the deadline and STOP permit, `probe` makes one short no-tools model request to read actual usage. It has a 60-second limit. Do not run a probe as part of the offline test suite.

```sh
node scripts/claude-run.mjs probe
node scripts/claude-run.mjs check
# Save the bounded task and start prompt in an ignored local file first.
caffeinate -i node scripts/claude-run.mjs run .overnight/task.txt
```

Proceed only after a successful probe and check. A permission or hook failure blocks dispatch. The run prompt tells Claude to use the official Codex plugin, `codex:codex-rescue`, `gpt-6.1-sol` and `--fresh` for coding. It tells the lead to record owned Codex job IDs in `.overnight/<sessionId>.jobs.md`. It does not invoke a direct Codex CLI task.

Both usage windows must have a future reset time. The observation must be at most 15 minutes old. Seven-day usage must be below 55%; five-hour usage must be below 95%. Utilization is a fraction from 0 to 1. Missing, invalid, percent-like or expired data blocks a run. A reset never changes an old observation to zero. `check` and `probe` report `nextReset` and both window values when valid telemetry is available. Unknown data clears the saved allowance and pauses work.

The fixed deadline is **2026-10-03T16:00:00Z**. The controller stops at that time, on `.overnight/STOP`, on a usage threshold, on overage, or on unknown/stale data. It requires live telemetry within 30 seconds. It also stops after 20 minutes or on receipt of the twelfth lead assistant message. It counts repeated message IDs once and excludes child messages with `parent_tool_use_id`. Missing IDs count separately. This conservative limit can cancel a final response before its result event.

Claude Code 2.1.288 does not list `--max-turns` in help. On 2026-10-03, a no-prompt `claude --print --max-turns 12` call reached the expected missing-input error. An invented option was rejected. The controller uses that parser check without a model call. If the CLI rejects `--max-turns`, the controller omits it and enforces the stream limit. An unknown parser response blocks launch. Help alone is insufficient because this CLI's help path accepts unknown options.

Launch uses an argument array, without a shell, and `--permission-mode auto --permission-prompts none`. It refuses any set `ANTHROPIC_API_KEY`, including an empty value. It does not change user or global configuration. Missing permissions are a blocker. The observed no-prompt parser check reported a configured plugin `SessionEnd` hook error: `EPERM: operation not permitted, unlink` for the plugin's broker state. This check proves flag acceptance only. Live plugin permissions need a separate check by the controller.

Stdout contains concise JSON metadata. Raw streams stay in private `.overnight/<sessionId>.log` files. The directory has mode 700; new logs, usage and locks have mode 600. Only sanitized usage and its observation time go into `.overnight/usage.json`, through a temporary file and rename. These files are ignored by Git.

## Stop and recover

```sh
mkdir -p .overnight
touch .overnight/STOP
```

The guard sends SIGTERM only to its owned Claude child. If that child does not exit, it sends SIGKILL after two seconds. It releases `.overnight/run.lock` after the child exits. The lock contains the controller PID, start time and session ID. A second probe or run is blocked. An active or stale lock is never deleted automatically. Inspect the recorded PID, start time, private log and owned jobs before manual recovery. Remove a stale lock only after confirming that its controller and child have ended. Remove STOP only when the controller is ready to resume.

A cancelled lead can leave plugin workers running. **Before dispatching again, the controller must inspect and cancel only that run's owned Codex job IDs.** Use its job handoff and private log. If the job list is incomplete, inspect plugin status and establish ownership before any cancellation. The guard does not cancel plugin workers or prove that none remain. The lock covers only this worktree, not other Claude sessions.

The usage ceiling is not exact. Requests in flight, plugin workers and other account activity can cross a threshold before the next event. No current usage allowance or successful unattended launch is claimed by the offline checks.

## Hardware and Cursor

The Ray-Ban Meta Gen 2 glasses can supply route recordings later. Direct live integration requires a native iOS/Android companion using Meta's Device Access Toolkit. It is outside this web MVP's critical path. Do not assume the display-only web-app path applies to Wayfarer Gen 2 glasses. See the [Meta FAQ](https://developers.meta.com/wearables/faq/).

Cursor should do real work: inspect a PR, find UX defects, verify an error path or improve an assigned screen. Record the resulting changes and evidence. Usage alone does not establish prize eligibility. The supplied kit describes a SpaceX track with additional space-data and Grok requirements; its current rules still need confirmation from the organizer. Do not redirect the app only to spend quota.

## Current launch state

The controller passes 29 fake-process checks under Node 24.11.1. Core checks and typecheck pass. The default build is blocked by worktree dependency resolution; the supported Webpack fallback is blocked by Google Fonts DNS resolution. No real probe or lead run was made for this change. See [the guard receipt](../stages/03-build/output/overnight-guard.md) and `PROGRESS.md`. A live launch and owned plugin job recovery remain unverified.
