# CI checks

Date: 2026-10-03. Branch: `feat/ci-checks`. Base: `66034b4`.

The workflow checks pull requests and pushes to `main` on `ubuntu-latest`.
It uses Node 24, the npm cache, read-only contents permission, and a 15-minute
timeout. A new run cancels an older run for the same workflow and Git ref.
Actions: `actions/checkout@v7.0.1` and `actions/setup-node@v7.0.0`.

Script review: all three scripts can run on Ubuntu. The Claude checks inject
fake processes and need no Claude CLI. The server checks use local HTTP and
temporary data. None needs secrets or a network provider. All three are included.
No dependencies, browser install, model probes, or reset command were added.

Local results on this Mac: Node 24.11.1, npm 11.6.2. `node_modules` was absent;
`npm ci` installed it in this worktree without a symlink.

| Check | Result and actual output summary |
|---|---|
| `npm ci` | PASS, exit 0. Added 31 packages. |
| `npm run check` | PASS, exit 0. Core checks covered approval, unknown scenes, reorientation, arrival, stale ordering, provider failure, locale preservation, and safe store loading. |
| `npm run typecheck` | PASS, exit 0. `tsc --noEmit` reported no errors. |
| `npm run build` | FAIL, exit 1. Next.js could not fetch Atkinson Hyperlegible from `fonts.googleapis.com`. |
| `node scripts/claude-run.check.mjs` | PASS, exit 0. 31 tests passed; 0 failed, skipped, or cancelled. All processes were fake. |
| `node scripts/isolated-server.check.mjs` | FAIL, exit 1. The sandbox denied the listener: `listen EPERM` on `0.0.0.0`. |
| `node scripts/smoke-api.mjs` | FAIL, exit 1. The sandbox denied `0.0.0.0:3107`; `next start` exited 1 before HTTP assertions ran. |
| YAML validation with installed Python PyYAML | PASS, exit 0. The file parsed. Triggers, permission, concurrency, runner, timeout, action versions, Node version, cache, and command order matched the requirements. |

Limits: the build needs public Google Fonts access. Local font access
failed in the worker sandbox, which also denied local listeners. The failed build left the
sandbox server checks incomplete; the host rerun below passed them. No browser/UI checks or provider evidence
were produced. No scripts or application files were changed.

Host lead rerun, same worktree, outside the worker sandbox: `npm run build` PASS
(exit 0, fonts fetched); `node scripts/isolated-server.check.mjs` PASS (busy port
rejected without touching existing server); `node scripts/smoke-api.mjs` PASS
(`smoke passed`). The sandbox failures above are environment limits.

Commit status: the worker sandbox denied `git add` (worktree `index.lock`). The
host lead staged the four owned paths, committed and opened the PR.

Hosted CI, observed 2026-10-03: PR #3 head `3f5b829` ran workflow `CI`, job
`checks`, on `ubuntu-latest`; it passed in 33s
(https://github.com/jayclim/BigRed26/actions/runs/37107022203/job/111157440429).
The controller reviewed the exact head and found no blocking issues. Hosted CI
covers core, typecheck, build, guard and server smoke checks only. It does not
cover browser/UI, real devices or providers.

Next action: queue item 1a, detailed route actions.
