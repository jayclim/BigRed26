# Current state

Updated: 2026-10-03. Lead: Claude Code. Its initial build/review runs are complete. New sessions use `docs/OVERNIGHT.md` and `knowledge/work-protocol.md`; the old build session is `93ecef95-52b5-4b04-9921-a843756f4f8b`.

| Stage | State | Evidence / next action |
|---|---|---|
| Scope | Mock complete; detailed actions added to live MVP scope | `stages/01-scope/output/complex-route-guidance.md` |
| Design | Rendered and refined | `stages/02-design/output/local-mvp-design.md` |
| Build | Local mock MVP complete | `docs/CLAUDE-HANDOFF.md` |
| Verify | Mock/code/UI gates passed; live gate pending | `stages/04-verify/output/verification.md` |
| Project brain | Three original skills validated; shared orchestrator added and validated | `AGENTS.md`, `knowledge/`, `skills/` |
| Overnight workflow | Rules and queue saved; launch not yet verified | `stages/03-build/output/overnight-setup.md` |

The zip was unpacked into `breadcrumb-kit/`; no app existed initially. Claude built the Next.js/TypeScript mock slice. Codex established the ICM-inspired brain and verified the result. Human assignments live in `docs/TEAM-HANDOFF.md`.

The development server was started on `http://localhost:3000` bound to this computer, and the browser visibly showed the initial draft editor. Restart with `npm run dev -- --hostname 127.0.0.1 --port 3000` when needed. Claude loaded all three project skills; their validators and local-link checks pass. Persistence errors preserve files; tests use isolated data. The reuse requirement is canonical in `knowledge/reuse.md`.

The baseline was pushed to `jayclim/BigRed26` as `b1599fe`. Claude successfully dispatched Codex through the official plugin. A local heartbeat is active until noon; long feature runs remain gated on the usage guard's review and real CLI check. Guard work continues in its own worktree; runtime job details are in ignored `.overnight/controller-state.json`.

Next: finish the usage guard and PR checks. Then implement the detailed-action contract slice before extraction/matching is built around basic arrows. The new scope covers named doors, floor transitions and side-specific instructions; text support alone does not satisfy it. Cursor login and API configuration are pending. No footage is available. Stop by 2026-10-03 noon Eastern; use no paid overages. The Next.js dev server appends its own framework-doc pointer to `AGENTS.md`; the shared project instructions remain intact.

Live verification needs route footage, independent follow footage and provider configuration. No real recognition, action completion, ElevenLabs, Photon, analytics, phone test or public deployment has been demonstrated.
