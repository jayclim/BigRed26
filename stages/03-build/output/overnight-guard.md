# One-run Claude guard

Date: 2026-10-03. Status: implementation and fake-process checks complete. Live telemetry, permissions and official-plugin worker recovery are unverified.

Assignment: finish the two existing partial guard scripts. Base: `b1599fe25e71252dc2e76e476a8880c82aec3596`. Branch: `feat/overnight-guard`. Worktree: `.worktrees/overnight-guard`. Owned paths: `scripts/claude-run.mjs`, `scripts/claude-run.check.mjs`, this receipt, `docs/OVERNIGHT.md` and `PROGRESS.md`. No other agents, app edits, dependency changes or real model calls were used.

The guard uses the Node standard library and spawns installed Claude with an argument array and no shell. It provides `check`, one no-tools `probe`, and one fresh lead `run <prompt-file>`. The lead prompt requires coding through the official Codex plugin and rescue agent with `gpt-6.1-sol --fresh`. It does not start direct Codex CLI tasks. It uses auto permissions with no permission prompts and leaves user/global configuration in place.

It validates both fractional usage values and future reset times. Saved observations expire after 15 minutes. A run requires seven-day usage below 55%, five-hour usage below 95%, no overage, no API-key environment variable, no STOP and time before 2026-10-03T16:00:00Z. Unknown data pauses and clears the saved allowance. Reset alone never implies zero usage. Sanitized telemetry is written through a private temporary file and rename. Raw streams stay in ignored private logs. Metadata includes the launch session ID and next reset when known.

One exclusive PID/start/session lock covers probes and runs in this worktree. Active or stale locks block dispatch. A changed lock is preserved. The guard sends SIGTERM to its child on a blocker and SIGKILL after two seconds if needed. It releases its unchanged lock after completion. The maximum lead duration is 20 minutes. The stream guard stops on the twelfth lead assistant message. It counts repeated message IDs once and excludes forwarded child messages. Cancellation can precede the final result. Missing live telemetry blocks after 30 seconds or at exit.

The original valid-start test exposed a code defect. The launched UUID was correct, but the monitor overwrote it with `undefined` when the stream had no session ID. The code now preserves the owned launch UUID and blocks a foreign session ID. The test keeps the truthful requirement that launch and reported session IDs match.

Observed CLI: 2.1.288. `--max-turns` is absent from `claude --help`. `claude --print --max-turns 12`, with no prompt and closed stdin, exited 1 with the expected missing-input error. An invented flag produced an unknown-option error. Help with either flag exited 0; help alone cannot prove support. The guard checks parser support without a model call. If unsupported, it omits the flag and uses stream counting. Unknown preflight responses block launch.

The installed no-prompt parser check also reported a configured Codex plugin SessionEnd hook failure: `EPERM: operation not permitted, unlink` for its broker state. The controller blocks on a hook failure without exposing raw hook content. Flag acceptance does not establish live permissions. No configuration was changed.

## Actual checks

All commands used Node 24.11.1 through `PATH="/Users/jaydenl/.nvm/versions/node/v24.11.1/bin:$PATH"`.

| Command | Result |
|---|---|
| `node scripts/claude-run.check.mjs` | Passed: 29 fake-process tests. No real model/network calls in the suite. |
| `npm run check` | Passed: core checks. |
| `npm run typecheck` | Passed. |
| `npm run build` | Blocked: Turbopack cannot resolve `next/package.json` inside the worktree. The installed package resolves from the parent checkout. |
| `npm run build -- --webpack` | Blocked: `getaddrinfo ENOTFOUND fonts.googleapis.com`; existing Atkinson Hyperlegible font could not be fetched. The flag is listed by the installed Next.js CLI. |
| `node scripts/claude-run.mjs check` | Expected exit 1: no saved current usage observation. No model call. |
| `git diff --check` | Passed for tracked changes. The private commit check also covers all five owned paths. |

Coverage includes valid start; missing telemetry; fraction versus percent; expired windows and old/future observations; 55% weekly and 95% five-hour thresholds before/during a run; overage and API keys; nonzero and failed children; deadline; STOP; duration; concurrent/stale/changed locks; missing permissions; spawn failure; controller interruption; SIGKILL escalation; hidden/unsupported flags; stream turn counting; and session metadata privacy.

## Limits and next action

No live probe or lead was started. No unattended success or current usage allowance is claimed. The lock does not cover other worktrees or account sessions. User/global hooks remain active and can report failures during no-prompt preflight.

A cancelled lead can leave official-plugin workers running. Before new dispatch, the controller must inspect/cancel only that run's owned Codex job IDs. The lead is instructed to record them in its ignored job handoff. The guard cannot prove that this list is complete or cancel those workers. Requests in flight and concurrent account usage can cross a threshold; the ceiling is not exact.

Next: publish this verified branch and obtain review without merging. The controller must inspect existing plugin jobs and resolve the hook permission error. Then, only if the deadline permits, obtain fresh live usage and verify one bounded official-plugin task. Re-run the app build in an environment with local dependencies and font-network access. Deployment and paid overages remain outside this assignment.

Git recovery: normal staging failed with `fatal: Unable to create '/Users/jaydenl/Dev/Hackathon/BigRed 2026/.git/worktrees/overnight-guard/index.lock': Operation not permitted`. The parent Git directory is outside this sandbox's writable roots. The shared index and branch ref stay unchanged. A private Git store at `.overnight/publish.git` and `.overnight/overnight-guard.bundle` preserve the commit inside the worktree. The private branch has the same base and only the five owned path changes. Push and PR creation use the authorized feature branch; publication depends on GitHub access. No merge is requested.

The requested GitHub retry failed. `git --git-dir=.overnight/publish.git push origin feat/overnight-guard` exited 128: `fatal: unable to access 'https://github.com/jayclim/BigRed26.git/': Could not resolve host: github.com`. `gh pr create --repo jayclim/BigRed26 --base main --head feat/overnight-guard --title "Guard one bounded Claude lead run" --body-file .overnight/pr-body.md` exited 1: `error connecting to api.github.com`, followed by `check your internet connection or https://githubstatus.com`. No push, PR or merge completed. The PR body is saved with the required Claude Code footer. Next: recover/publish the local commit after Git writes and GitHub access are available. No further network retry was made.
