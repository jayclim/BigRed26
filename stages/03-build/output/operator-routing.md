# Operator and orchestrator routing

Status: locally verified change, 2026-10-03. Git publication blocked; PR not created. Independent review is pending. Branch: `chore/operator-routing`; base: `3dedf82956d21b065db724e3443dd0d6662d1df9`.

Changed: [the work protocol](../../../knowledge/work-protocol.md) now owns role/model routing, foreground rescue completion, failed-handoff recovery and ephemeral session reuse. Root instructions, both project skills and [the overnight guide](../../../docs/OVERNIGHT.md) point to it. Three relative discovery symlinks expose the new operator skill. Only the guard's appended prompt and its existing assertion changed; guard behavior, flags and limits are unchanged.

Sources and provenance: the user's routing task and runtime evidence, 2026-10-03; installed `/Users/jaydenl/.claude/skills/operator/SKILL.md`, read 2026-10-03; `/Users/jaydenl/.codex/skills/.system/skill-creator/SKILL.md`, read 2026-10-03. The operator adaptation overrides the installed skill's Terra, gpt-5.6 and effort defaults. The project orchestrator overrides the global Sonnet executor/builder defaults. These are user decisions, not new runtime observations.

Observed local checks, 2026-10-03:

- `node --test scripts/claude-run.check.mjs`: exit 0; 31 tests, 31 pass, 0 fail. All processes were test fakes; no real model call.
- `git diff --check`: exit 0; no output.
- Relative-link check: 28 links across all eight changed/new Markdown files; 0 broken.
- The skill-creator `quick_validate.py` script: `Skill is valid!` for both operator and orchestrator. Operator has 20 lines.
- Symlink check: all three discovery links use `../../skills/operator` and resolve to `skills/operator/SKILL.md`.
- Required `grep -rn "Terra\|Sonnet\|status/result" ...`: four matches; only overridden defaults and the prohibition on completion collectors. No conflicting instruction remains.
- Scope check: only line 337, the appended prompt, changed in `scripts/claude-run.mjs`; only line 124, its existing assertion, changed in `scripts/claude-run.check.mjs`. The Next.js agent block is byte-for-byte unchanged.

Limitations: gpt-6-luna is authorized but unobserved. Sol success on Codex 0.159.2 is user-supplied prior evidence. Tool-level Agent allowlist enforcement is unverified. Hosted CI is pending. No model probe or other agent was started for this change.

Publication blocker: explicit-path `git add` exited 128 with `fatal: Unable to create '/Users/jaydenl/Dev/Hackathon/BigRed 2026/.git/worktrees/operator-routing/index.lock': Operation not permitted`. Stopped at that step. No commit, push or PR was created. No private Git store or permission workaround was used.

Next action: Claude completes the authorized commit/push/PR in a session that can write this worktree's Git metadata. Use commit title `Make operator and orchestrator routing durable` and trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Then obtain independent review of the exact PR commit, including the requested Cursor review; Claude Code checks CI, reconciles progress and merges. This worker does not merge.
