# Reuse policy and inventory

Status: user requirement, 2026-10-03. Reuse existing code, libraries, design assets and prebuilt tools wherever they meaningfully reduce work.

## Before implementing

Inspect the affected code and its callers. Look for an existing component/helper/contract, then native browser or standard-library support, then an installed dependency. Use a maintained external library or prebuilt tool when it replaces substantial work; check its fit, official API and license before adoption. Do not add a package merely to wrap a few clear lines. Dependency and lockfile changes go through Claude as integration owner.

Prefer adapting useful assets over redrawing them. Record the source/license of imported fonts, icons and illustrations. Do not invent landmark photos or reuse footage without a known right to use it. Build only the product-specific route logic that available tools do not supply.

## Current inventory

| Need | Reuse |
|---|---|
| App routing, server handlers, font delivery | Installed Next.js App Router and `next/font` |
| UI state and rendering | Installed React; existing creator/guide components |
| Validation | Installed zod schemas in `contracts/schemas.ts` |
| Camera, speech fallback, network, clipboard | Native browser APIs already used by the app |
| Design primitives | `src/ui/theme.css`, `src/ui/Arrow.tsx`, `src/ui/Brand.tsx`; extend before duplicating |
| Type and code checks | TypeScript, Node assertions/TS support, existing scripts; `scripts/isolated-server.mjs` provides temporary test data |
| Typography | Existing Atkinson Hyperlegible via `next/font/google`; inspect the provider's license when redistributing font assets separately |
| Browser review | Available host browser tools first; existing screenshot script for repeatable local captures |
| Knowledge/skills | Plain Markdown and shared local skills; no memory service dependency |

No external icon pack, component kit or illustration library has been adopted. Add one when a concrete screen needs it and it saves more than it costs. The original handoff fixture is already reused for deterministic mock observations.
