# Current state

Updated: 2026-10-03. Lead: Claude Code. Its initial build/review runs are complete. New sessions use `docs/OVERNIGHT.md` and `knowledge/work-protocol.md`; the old build session is `93ecef95-52b5-4b04-9921-a843756f4f8b`.

| Stage | State | Evidence / next action |
|---|---|---|
| Scope | Mock complete; detailed actions added to live MVP scope | `stages/01-scope/output/complex-route-guidance.md` |
| Design | Rendered and refined | `stages/02-design/output/local-mvp-design.md` |
| Build | Local mock MVP complete | `docs/CLAUDE-HANDOFF.md` |
| Verify | Mock/code/UI gates passed; live gate pending | `stages/04-verify/output/verification.md` |
| Project brain | Three original skills validated; shared orchestrator added and validated | `AGENTS.md`, `knowledge/`, `skills/` |
| Overnight workflow | Guard complete: 31 fake-process checks and a real host probe pass | `stages/03-build/output/overnight-guard.md`, `docs/OVERNIGHT.md` |
| Operator routing | Local checks passed; PR pending review after blocked Git publication | [Evidence receipt](stages/03-build/output/operator-routing.md). Sandbox denied `index.lock`; commit/push/PR not created. Independent review, then Claude merges. |

The zip was unpacked into `breadcrumb-kit/`; no app existed initially. Claude built the Next.js/TypeScript mock slice. Codex established the ICM-inspired brain and verified the result. Human assignments live in `docs/TEAM-HANDOFF.md`.

The development server was started on `http://localhost:3000` bound to this computer, and the browser visibly showed the initial draft editor. Restart with `npm run dev -- --hostname 127.0.0.1 --port 3000` when needed. Claude loaded all three project skills; their validators and local-link checks pass. Persistence errors preserve files; tests use isolated data. The reuse requirement is canonical in `knowledge/reuse.md`.

The baseline was pushed to `jayclim/BigRed26` as `b1599fe`. Claude successfully dispatched Codex through the official plugin. The heartbeat `breadcrumb-mvp-until-noon` is active every 20 minutes and ends 2026-10-03T16:00Z. Runtime job details stay in ignored `.overnight/` files.

Guard evidence, 2026-10-03: `scripts/claude-run.mjs` provides `check`, one no-tools `probe`, and one bounded `run <prompt-file>`. It rejects unknown/stale usage, API-key authentication, overage, thresholds, STOP and the deadline. One private lock blocks concurrent controller runs. It cancels only its Claude child. The stream limit stops at 12 lead assistant messages; the duration limit is 20 minutes. The first real probe failed because `--disallowedTools` consumed the prompt; the fix passes `--` before the prompt.

Host checks after the fix: `node scripts/claude-run.check.mjs` passed 31 tests. The real Node 24 probe at 2026-10-03T07:20:31Z exited 0 with one assistant turn: five-hour usage 0.02, seven-day usage 0.17, no overage. Root-checkout `npm run check`, `npm run typecheck` and `npm run build` passed; app sources match between both PR heads. Use `PATH=/Users/jaydenl/.local/bin:/Users/jaydenl/.nvm/versions/node/v24.11.1/bin:$PATH` on this Mac. It selects Node 24.11.1 and Codex 0.159.2. Node alone first selects npm Codex 0.149.1, which rejects `gpt-6.1-sol`. See [the receipt](stages/03-build/output/overnight-guard.md).

Next: implement the detailed-action contract slice (queue item 1a) before providers or extraction/matching are built around basic arrows. The scope covers named doors, floor transitions and side-specific instructions; text support alone does not satisfy it. Before each guarded run, inspect existing plugin jobs and cancel only owned ones. CI installed by PR #3; hosted run 37107022203 passed on `3f5b829` (job `checks`, 33s). No footage, API file or Cursor sign-in is available. Stop by 2026-10-03T16:00Z; deployment and paid usage are not authorized. The Next.js dev server appends its own framework-doc pointer to `AGENTS.md`; the shared project instructions remain intact.

Live verification needs route footage, independent follow footage and provider configuration. No real recognition, action completion, ElevenLabs, Photon, analytics, phone test or public deployment has been demonstrated.
