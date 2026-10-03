# Breadcrumb

Breadcrumb is a mobile-first web app for teaching and following a short indoor route. Claude Code is the lead developer and integration owner. Human teammate ownership is in [docs/TEAM-HANDOFF.md](docs/TEAM-HANDOFF.md).

## Start here

Use the local [operator skill](skills/operator/SKILL.md) and [orchestrator skill](skills/orchestrator/SKILL.md) for all work in this multi-agent build. Read [CONTEXT.md](CONTEXT.md), then the selected stage's `CONTEXT.md`. Read only its listed inputs. Use [PROGRESS.md](PROGRESS.md) for current work state; planning documents and file existence do not establish completed features.

## The project brain

| Location | Purpose |
|---|---|
| `knowledge/` | Maintained product, architecture, design and source references |
| `stages/01-scope/` | Turn evidence and requests into bounded scope |
| `stages/02-design/` | Design the experience against that scope |
| `stages/03-build/` | Implement the chosen slice |
| `stages/04-verify/` | Record observed checks and remaining gaps |
| `stages/*/output/` | Editable working artifacts; evidence, not standing instructions |
| `skills/` | Canonical local skills, exposed through `.agents/skills/` and `.claude/skills/` |
| `breadcrumb-kit/` | Original unpacked handoff; preserve unchanged |
| `src/`, `contracts/` | Application and executable API contracts |

Follow [knowledge/working-method.md](knowledge/working-method.md) when reconciling knowledge. Fix recurring mistakes in their maintained source, then recheck affected outputs. Keep evidence status, dates and provenance with claims. Never turn a proposed integration into an implemented fact.

## Boundaries

Follow [knowledge/work-protocol.md](knowledge/work-protocol.md) for roles, model routing, PRs, knowledge updates and usage limits. Use the operator and orchestrator skills. Claude Code is the lead and sole merger; implementation uses the official Codex plugin under the protocol's routing rules. Respect file ownership and concurrent edits. Shared contracts and root configuration belong to the integration owner. The user authorized local agent work and commits, pushes and PR integration in `jayclim/BigRed26`. Deployment, paid overages and messages to other people remain outside the current authorization.

Reuse existing code, libraries, design assets and prebuilt tools before implementing new machinery. Use [knowledge/reuse.md](knowledge/reuse.md) for the concrete inventory and adoption rule.

Navigation invariants live in [knowledge/architecture.md](knowledge/architecture.md); design requirements live in [knowledge/design-system.md](knowledge/design-system.md). Read them for their respective tasks. Never store secrets in the knowledge base.

Every change includes a knowledge update with actual checks, limitations and the next action. Workers update their named stage output and affected references. The merger reconciles `PROGRESS.md` before merge. Use Simplified Technical English. Change enduring references only when the underlying decision or evidence changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
