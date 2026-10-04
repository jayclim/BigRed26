# Motion polish

Status: implemented; code checks passed with a Webpack build; rendered review blocked. Date: 2026-10-03. Source: the user's bounded [SOL] motion assignment.

Worktree: `.worktrees/motion-polish`. Branch: `feat/motion-polish`. Base: `origin/main` at `9b65316e3c51d95fa7d5e8b2fd182ac032a2e619`.

## Changed

- Added a labeled Motion section at the end of `src/ui/theme.css`. It adds entry/exit easing and a 400ms entrance token. Existing 120/160/240ms tokens, palette, fonts, layout and 44px targets stay intact.
- Creator header, sidebar and trail items fade and rise once per mount. Item delays use 32ms steps, capped at 160ms. Guide top bar, stage and card fade once. Entrances finish within 400ms.
- Buttons, guide controls, mock scenes and review rows get hover, press and focus feedback. Inputs get border and soft cyan focus-shadow transitions. No input mount animation is added.
- Creator status and extraction/save notices enter and exit with opacity and a small translate. Exiting notices retain their normal-flow space. The share panel fades and rises after approval. Review nodes get a color transition and one subtle pop. The approve-bar shadow transitions on interaction.
- Guide state and instruction text use text-keyed `AnimatePresence` with wait sequencing. The instruction key also includes state. The card border-top color transitions. Existing classes, DOM tags and event handlers remain.
- MotionConfig retains user reduced motion and shares the entry easing. CSS disables motion and control transforms under reduced motion. JS fades have zero duration under reduced motion. Only transform, opacity, colors and shadows animate.

## Checks

Observed in the assigned worktree on 2026-10-03, Node 24.11.1:

| Command | Result |
|---|---|
| `npm run check` | Exit 0. Core, media and 32 extraction cases passed. Extraction checks made no network calls. |
| `npm run typecheck` | Exit 0. `tsc --noEmit` passed. |
| `npm run build` | Exit 1. Turbopack rejects the supplied `node_modules` symlink because its target is outside the filesystem root. |
| `npm run build -- --webpack` | Exit 0. Compiled successfully; build TypeScript checks and all 6 static pages passed. No shared dependency or root configuration change was needed. |
| `git diff --check` | Exit 0. No whitespace errors. Source diff review found only presentation changes. |
| Isolated browser-review server, port 3118 | Exit 1. `next start` failed with `listen EPERM` on `0.0.0.0:3118`. No browser captures or rendered review were completed. |
| Explicit-path `git add` | Exit 128. The sandbox denied creation of `.git/worktrees/motion-polish/index.lock` with `Operation not permitted`. No file was staged. |

The checks emitted existing `NO_COLOR`/`FORCE_COLOR` warnings. No source failure was reported by the passing checks. Installed Next.js client-boundary and CLI documentation was read before use. Motion's official AnimatePresence and reduced-motion documentation was consulted. No dependency was added.

The final Webpack build was repeated after the exit-easing token was aligned with Motion's ease-in. It passed. The failed default build is an environment limitation, not a passing default-build result.

## Lead verification (Claude host, 2026-10-03)

The host replaced the `node_modules` symlink with an APFS clone and re-ran the checks. `npm run check`, `npm run typecheck` and the default Turbopack `npm run build` all exited 0. The earlier build failure was the symlink only.

Rendered review: `next start` on port 3917, headless Chrome through CDP, 390x844 and 1280x900. Observed: entrances settle to full opacity; a review checkbox click sets `data-reviewed=true` on its trail item; approval shows the visitor-link panel and the "Version 1 approved" notice; the guide at 390px shows the Mock badge, an unanimated progress row, the instruction card and mock controls. No horizontal overflow at either width. Not observed: the motion frames themselves, keyboard focus traversal, reduced-motion mode, Spanish, uncertainty/arrival states, or a real phone.

Next action: a separate reviewer checks this commit, with attention to the merge with PR #15 (`theme.css`, `CreatorScreen.tsx`) and PR #17 (`GuideScreen.tsx`).
