# Current state

Updated: 2026-10-03. Lead: Claude Code. Its initial build/review runs are complete. New sessions use `docs/OVERNIGHT.md` and `knowledge/work-protocol.md`; the old build session is `93ecef95-52b5-4b04-9921-a843756f4f8b`.

| Stage | State | Evidence / next action |
|---|---|---|
| Scope | Local mock slice defined | `stages/01-scope/output/local-mvp-scope.md` |
| Design | Rendered and refined | `stages/02-design/output/local-mvp-design.md` |
| Build | Local mock MVP complete | `docs/CLAUDE-HANDOFF.md` |
| Verify | Mock/code/UI gates passed; live gate pending | `stages/04-verify/output/verification.md` |
| Project brain | Three original skills validated; shared orchestrator added and validated | `AGENTS.md`, `knowledge/`, `skills/` |
| Overnight workflow | One-run guard passes 29 fake-process checks; live launch pending | `stages/03-build/output/overnight-guard.md`, `docs/OVERNIGHT.md` |

The zip was unpacked into `breadcrumb-kit/`; no app existed initially. Claude built the Next.js/TypeScript mock slice. Codex established the ICM-inspired brain and verified the result. Human assignments live in `docs/TEAM-HANDOFF.md`.

The development server was started on `http://localhost:3000` bound to this computer, and the browser visibly showed the initial draft editor. Restart with `npm run dev -- --hostname 127.0.0.1 --port 3000` when needed. Claude loaded all three project skills; their validators and local-link checks pass. Persistence errors preserve files; tests use isolated data. The reuse requirement is canonical in `knowledge/reuse.md`.

Next: publish the verified baseline to the user-provided empty public repository `jayclim/BigRed26`; prove the official-plugin and usage-guard path. Cursor login and API configuration are pending. No footage is available. Stop by 2026-10-03 noon Eastern; use no paid overages. The Next.js dev server appends its own framework-doc pointer to `AGENTS.md`; the shared project instructions remain intact.

Guard evidence, 2026-10-03: `scripts/claude-run.mjs` provides `check`, one no-tools `probe`, and one bounded `run <prompt-file>`. It rejects unknown/stale usage, API-key authentication, overage, thresholds, STOP and the deadline. One private lock blocks concurrent controller runs. It cancels only its Claude child. The stream limit stops at 12 lead assistant messages; the duration limit is 20 minutes. Claude Code 2.1.288 accepted the hidden `--max-turns` flag in a no-prompt parser check. That check also reported an existing plugin SessionEnd hook `EPERM` error. Live permissions are unverified.

Checks in `feat/overnight-guard`, using Node 24.11.1: `node scripts/claude-run.check.mjs` passed 29 tests; `npm run check` and `npm run typecheck` passed. `npm run build` failed because Turbopack cannot resolve the parent-installed Next.js package from this worktree. `npm run build -- --webpack` failed with `getaddrinfo ENOTFOUND fonts.googleapis.com`. No dependencies or app code changed. `node scripts/claude-run.mjs check` correctly blocked without saved usage. No real model calls were made.

Guard next action: review and publish this branch. Then the controller must inspect existing official-plugin jobs and resolve its hook permission error before a live probe/task, only if the fixed deadline permits. A cancelled lead can leave plugin workers running; inspect/cancel only that run's owned Codex job IDs before new dispatch. In-flight and concurrent account usage can exceed the monitored ceiling. See [the receipt](stages/03-build/output/overnight-guard.md).

Git limitation in this sandbox: `git add` cannot create the parent checkout's `.git/worktrees/overnight-guard/index.lock` (`Operation not permitted`). The shared worktree index and branch ref remain unchanged. A private Git store and recovery bundle in ignored `.overnight/` preserve the local commit for publication or recovery. The requested GitHub retry failed: push reported `Could not resolve host: github.com`; PR creation reported `error connecting to api.github.com`. No push, PR or merge completed. Next: recover/publish the saved commit when parent Git writes and GitHub access are available.

Live work needs route footage, independent follow footage and provider configuration. No real recognition, ElevenLabs, Photon, analytics, phone test, public deployment or repository publication has been demonstrated.
