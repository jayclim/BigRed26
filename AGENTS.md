# Breadcrumb

Breadcrumb is a mobile-first web app for teaching and following a short indoor route. See [README.md](README.md) for the product, setup and checks. This file is the short guide for contributors and coding agents.

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, zod. Node 22.18 or newer (tested on 24). One Node process with a local JSON store (`.data/`) and local media. There are no accounts.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run check` | Unit checks, no network |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build. Run it before any script that starts a server |
| `node scripts/smoke-api.mjs` | HTTP walk-through on an isolated server |
| `npm run photon-agent` | iMessage agent process (needs provider keys) |

Every provider (Gemini, xAI Grok, Photon, Nessie, ElevenLabs) is off until its flag and key are set. See the table in the README. Keep keys in an ignored `.env.local`. Never commit secrets. Test scripts use temporary data and never touch `.data/`.

## Where things live

| Path | Contents |
|---|---|
| `src/app/` | Pages and API routes |
| `src/features/` | Landing, creator and guide UI |
| `src/server/` | Navigation rules, Gemini, live tokens, agent, Nessie, bounties |
| `src/client/`, `src/shared/`, `src/ui/` | Browser helpers, shared limits, design primitives |
| `contracts/` | Shared types and zod schemas. Changes need care: the server and client both depend on them |
| `scripts/` | Smoke tests, browser checks and the iMessage agent |
| `knowledge/` | [architecture](knowledge/architecture.md), [design system](knowledge/design-system.md), [product](knowledge/product.md), [reuse and licenses](knowledge/reuse.md) |
| `archive/` | Build-process history from the hackathon. Not needed to run the app |

## Rules to keep

- Guidance comes only from an approved, immutable route version. Read the navigation invariants in [knowledge/architecture.md](knowledge/architecture.md#navigation-invariants) before you change guidance logic. Never show a direction before the approach is confirmed. Never fall back silently to fake data.
- Follow the visual language and interaction rules in [knowledge/design-system.md](knowledge/design-system.md).
- Before you add a package or asset, check [knowledge/reuse.md](knowledge/reuse.md). Record the license of anything new.
- Add checks next to the code (`*.check.ts`) and add them to `npm run check`.
- Update the matching `knowledge/` file when a decision or invariant changes.

For the history of how the app was built (stage notes, verification receipts, agent workflow), see [archive/README.md](archive/README.md).


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
