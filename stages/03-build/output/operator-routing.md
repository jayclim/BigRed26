# Operator and orchestrator routing

Status: reviewed and merged by PR #4, 2026-10-03. Hosted CI passed on `f962d7a`. Initial worker publication was blocked; the Claude lead committed and pushed. Branch: `chore/operator-routing`; base: `3dedf82956d21b065db724e3443dd0d6662d1df9`.

Changed: [the work protocol](../../../knowledge/work-protocol.md) now owns role/model routing, foreground rescue completion, failed-handoff recovery and ephemeral session reuse. Root instructions, both project skills and [the overnight guide](../../../docs/OVERNIGHT.md) point to it. Three relative discovery symlinks expose the new operator skill. Only the guard's appended prompt and its existing assertion changed; guard behavior, flags and limits are unchanged.

Sources and provenance: the user's routing task and model authorization, 2026-10-03; Sol runtime success observed by controller, Claude lead and official plugin runs, 2026-10-03; installed `/Users/jaydenl/.claude/skills/operator/SKILL.md`, read 2026-10-03; `/Users/jaydenl/.codex/skills/.system/skill-creator/SKILL.md`, read 2026-10-03. The operator adaptation overrides the installed skill's Terra, gpt-5.6 and effort defaults. The project orchestrator overrides the global Sonnet executor/builder defaults. These are user decisions, not new runtime observations.

Observed local checks, 2026-10-03:

- `node --test scripts/claude-run.check.mjs`: exit 0; 31 tests, 31 pass, 0 fail. All processes were test fakes; no real model call.
- `git diff --check`: exit 0; no output.
- Relative-link check: 28 links across all eight changed/new Markdown files; 0 broken.
- The skill-creator `quick_validate.py` script: `Skill is valid!` for both operator and orchestrator. Operator has 20 lines.
- Symlink check: all three discovery links use `../../skills/operator` and resolve to `skills/operator/SKILL.md`.
- Required `grep -rn "Terra\|Sonnet\|status/result" ...`: four matches; only overridden defaults and the prohibition on completion collectors. No conflicting instruction remains.
- Scope check: only line 337, the appended prompt, changed in `scripts/claude-run.mjs`; only line 124, its existing assertion, changed in `scripts/claude-run.check.mjs`. The Next.js agent block is byte-for-byte unchanged.

Limitations: gpt-6-luna is authorized but unobserved. Sol success on Codex 0.159.2 was observed in controller, Claude lead and plugin runs; the user supplied the authorization, not the runtime evidence. Tool-level Agent allowlist enforcement is unverified. No model probe or other agent was started for this change.

Initial publication blocker (resolved): explicit-path `git add` exited 128 with `fatal: Unable to create '/Users/jaydenl/Dev/Hackathon/BigRed 2026/.git/worktrees/operator-routing/index.lock': Operation not permitted`. Stopped at that step. No commit, push or PR was created. No private Git store or permission workaround was used.

Integration, 2026-10-03: the Claude lead committed `f962d7a` and opened PR #4. Lead rerun: 31 guard tests pass; links verified. Hosted run https://github.com/jayclim/BigRed26/actions/runs/37108819370 passed on `f962d7a`. Controller convention review found no blocking issue; it asked for the provenance and Cursor wording corrections in this receipt, the work protocol, the operator skill, `PROGRESS.md` and the overnight guide. Cursor CLI is now signed in, but its spending limits are unverified, so no Cursor review ran. Root `.env.local` exists; provider budgets and real API success are unverified. Rescue: thread `01a100c8-4dfd-7fe2-9ed0-b921c5b12d2e`, job `task-mus3s8gt-sfk9l9`, completed.

Next action: the Claude lead recovers the preserved detailed-action worktree and chooses the smallest complete step under the new routing.
