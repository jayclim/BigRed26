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
| Typography | System sans stack in `src/ui/theme.css`; no font download or redistributed font asset |
| Browser review | Available host browser tools first; existing screenshot script for repeatable local captures |
| Knowledge/skills | Plain Markdown and shared local skills; no memory service dependency |
| Browser video compression | Mediabunny 1.61.1, MPL-2.0; lazy-loaded with `await import('mediabunny')` when compression starts; installed types reviewed 2026-10-03. [Official source](https://github.com/Vanilagy/mediabunny). Teach uses its conversion API and browser codecs. |

No icon pack, dashboard template or illustration library is adopted. Four shadcn source primitives are adapted for the creator interface. Add only primitives that the current screen uses. The original handoff fixture is already reused for deterministic mock observations.


## Design foundation adoption

Observed installed versions and package licenses, 2026-10-03. npm installed these into the design-system worktree from cached registry packages. The npm cache had to be copied selectively to a writable temporary cache because shell network access and writes to the shared cache were blocked. The lockfile pins the registry sources. No global package or provider was changed.

| Dependency | Version | License | Source / purpose |
|---|---|---|---|
| tailwindcss, @tailwindcss/postcss | 4.3.3 each | MIT | [Tailwind](https://github.com/tailwindlabs/tailwindcss); v4 utilities and build plugin |
| clsx | 2.1.1 | MIT | [clsx](https://github.com/lukeed/clsx); conditional classes |
| tailwind-merge | 3.7.0 | MIT | [tailwind-merge](https://github.com/dcastil/tailwind-merge); merge utility classes |
| class-variance-authority | 0.7.1 | Apache-2.0 | [CVA](https://github.com/joe-bell/cva); Button and Badge variants |
| @radix-ui/react-slot | 1.2.4 | MIT | [Radix primitives](https://github.com/radix-ui/primitives); semantic Button link composition |
| motion | 13.5.0 | MIT | [Motion](https://github.com/motiondivision/motion); creator status transitions and reduced motion |

CVA is Apache-2.0, not MIT. Its installed package states this license. All other named additions are MIT.

Copied source: [shadcn new-york Button](https://ui.shadcn.com/r/styles/new-york/button.json), and [new-york-v4 Input, Textarea and Badge](https://github.com/shadcn-ui/ui/tree/main/apps/v4/registry/new-york-v4/ui), inspected 2026-10-03. These sources are MIT. The notice is retained in `src/ui/shadcn-LICENSE.txt`. Local changes map tokens, trim unused variants, use the scoped Radix Slot, use small radii and retain 44px controls. Native select behavior is reused. Tailwind preflight is omitted to preserve the guide interface.

## Archify skill (vendored, not run automatically)

Status: added in PR #19, 2026-10-03, for the architecture diagram `docs/architecture/breadcrumb.html`.

| Item | Record |
|---|---|
| Source | https://github.com/tt-a1i/archify, commit `d5a1333` |
| Version | 3.0.1 (`skills/archify/skill-release.json`) |
| Licence | MIT |
| Location | `skills/archify/`; symlinks `.claude/skills/archify` and `.agents/skills/archify` |
| Third-party assets | `skills/archify/THIRD_PARTY_NOTICES.md` lists bundled brand marks. Some icons are CC-BY-NC-SA or CC-BY-SA. The Breadcrumb diagram uses none of them. Do not copy those icons into the product. |

Network and process behavior: the finalize and deliver scripts fetch an update manifest (`DEFAULT_MANIFEST_URL` in `skills/archify/scripts/update-contract.mjs`, and `scripts/check-update.mjs`) and write a local cache. When invoked, the scripts also launch Chrome, the OS opener and git. Brand-mark capture (`renderers/shared/brand-marks.mjs`) also makes HTTP(S) requests to links in a diagram; it has no off switch, so do not render diagrams with private or untrusted links. Nothing runs automatically. Set `ARCHIFY_UPDATE_CHECK_DISABLED=1` before any Archify script run to disable the update check. Local run receipts go to `.archify/`, which is git-ignored because it contains absolute user paths. The vendored code has not had a full code review.
