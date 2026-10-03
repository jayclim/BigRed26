# Detailed route actions — queue item 1a

Date: 2026-10-03. Status: implemented in mock mode and host-verified (core, typecheck, normal build, HTTP smoke, rendered UI) on 2026-10-03; independent review pending. The worker-sandbox results below are kept as history. Branch: `feat/detailed-route-actions`. Base and current HEAD: `3dedf82956d21b065db724e3443dd0d6662d1df9` (`origin/main` at assignment).

## Task and scope

Implement the lead's optional action contract with the existing checkpoint state machine. No workflow engine, provider calls, secrets, dependency or root configuration changes. Work is limited to this worktree. The original kit and legacy fixture remain unchanged.

Inputs read: `AGENTS.md`, local orchestrator skill, root/build context, work protocol, architecture, reuse/working-method/design references, scope/design stage inputs, detailed guidance scope, contracts, core, creator/guide, API routes and installed Next.js route-handler/client-component/CLI guides. Breadcrumb design and verification instructions informed review. The React component checklist was read. No extra agents were started.

Owned changes: contracts and separate action fixture; core approval, rendering, progression, fixture recognizer and checks; manual API route; creator action editor and guide display; existing theme; architecture, progress and this receipt. A concurrent one-line `src/client/httpCore.ts` change supplies `completeAction`; it was preserved, not authored by this worker. Inclusion permission was requested. Git staging is blocked before any commit can include it.

## Result

- Amendment 3 keeps schema version 1. Optional actions contain kind, target, side, floor, ordered bilingual steps and completion. Existing routes retain their data and lack of action.
- Approval accepts a direction or complete action. Actions require target/completion/step locales; elevators require a floor. A destination has no direction or action.
- Recognition selects an action and needs evidence naming its target. B215 cannot select B214. A Floor 2 view cannot confirm the approved Floor 3 landing. Repeated elevator entrance/button views and time never complete the ride. Unknown views preserve the action. Unconfirmed approach gives reorient and no arrow.
- The existing current/next window, central sequences, commit-time race check, pinned version and locale refresh remain. Completing into a non-action next checkpoint also requires its identifying evidence.
- `completeAction` and `POST /api/sessions/:id/complete-action` validate `{routeVersion, sequence, checkpointId}`. The active action advances one step with `manual_advance` and explicit manual evidence, never `checkpoint_confirmed`. A concurrent lead edit keeps the next step uncertain with no arrow until its approach is observed. Manual arrival has explicit manual evidence and no visual arrival event.
- Creator review edits kind, target, side, floor, step order, both step locales and both completion locales. An edit clears that step's review. The guide shows these fields and a manual button only for an active action, including during camera loss. Guiding can have no arrow. Browser speech receives approved action text with exact labels, floors and localized side qualifiers.
- The creator can explicitly select the separate `action-fixture` draft. It covers B214/B215, Lift A to floor 3, Floor 3 landing and Rock R1 on the right. All fixture data and selectors remain labeled mock. Existing stores are not migrated or silently rewritten.

## Checks and exact results

Environment: macOS worker sandbox, Node 24.11.1, Next.js 16.3.8. Commands used `PATH=/Users/jaydenl/.local/bin:/Users/jaydenl/.nvm/versions/node/v24.11.1/bin:$PATH`. All test state used isolated temporary data. No reset command was used.

`npm run check` — exit 0:

```text
> check
> node src/server/core/core.check.ts

core check passed: approval, unknown scene, reorient, arrival, stale ordering, provider failure, locale preservation, safe store loading; action selection/completion, named targets, floor/approach checks, null arrows, manual freshness/race/events, bilingual action speech, immutable action versions
```

Checks include: legacy parsing without invented action/evidence; bilingual approval; action selection versus completion; named-door mismatch; wrong floor; elevator entrance/button/lost view; elapsed-time non-completion; missing/reversed approach; null guiding arrow; wrong-version/wrong-step/stale/duplicate manual requests; manual event provenance; manual/recognition race; Spanish side/floor/steps; case-insensitive targets; destination evidence; immutable nested actions and version pinning. A manual next-step arrow is absent until new approach evidence restores it.

`npm run typecheck` — exit 0, no diagnostics:

```text
> typecheck
> tsc --noEmit
```

`npm run build` — exit 1:

```text
▲ Next.js 16.3.8 (Turbopack)
✓ Running next.config took 4ms
Creating an optimized production build ...
Turbopack build encountered 1 warning:
[next]/internal/font/google/atkinson_hyperlegible_aad595f7.module.css
Warning: Error while requesting resource
There was an issue establishing a connection while requesting https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap

Build error occurred
Error: Turbopack build failed with 1 error:
[next]/internal/font/google/atkinson_hyperlegible_aad595f7.module.css
Error: next/font: error:
Failed to fetch Atkinson Hyperlegible from Google Fonts.
If you are offline or behind a proxy, self-host the font with next/font/local, or set HTTP_PROXY/HTTPS_PROXY so Next.js can reach fonts.googleapis.com.
```

Both import traces point to the existing `src/app/layout.tsx`; it was not edited.

Supplemental Turbopack attempt with `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/private/tmp/breadcrumb-actions-font.cjs npm run build` — exit 1:

```text
Error: Turbopack build failed with 1 error:
[next]/internal/font/google/atkinson_hyperlegible_aad595f7.js:1:1
Error: Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/cssmodule.module.css'
creating new process
Caused by:
- binding to a port
- Operation not permitted (os error 1)
```

The mock response file is temporary and maps the existing Google CSS URL to an `@font-face` using `local('Arial')`. It changes neither dependencies nor tracked configuration. It avoids font network requests and does not validate Atkinson rendering.

Supplemental `NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/private/tmp/breadcrumb-actions-font.cjs npm run build -- --webpack` — exit 0:

```text
> build
> next build --webpack

▲ Next.js 16.3.8 (webpack)
✓ Running next.config took 4ms
Creating an optimized production build ...
✓ Compiled successfully in 1071ms
Running TypeScript ...
Finished TypeScript in 593ms ...
Collecting page data using 13 workers ...
Generating static pages using 13 workers (0/4) ...
Generating static pages using 13 workers (1/4) ...
Generating static pages using 13 workers (2/4) ...
Generating static pages using 13 workers (3/4) ...
✓ Generating static pages using 13 workers (4/4) in 75ms
Finalizing page optimization ...
Collecting build traces ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/routes/[id]
├ ƒ /api/routes/[id]/approve
├ ƒ /api/routes/[id]/draft
├ ƒ /api/routes/[id]/quality
├ ƒ /api/sessions
├ ƒ /api/sessions/[id]
├ ƒ /api/sessions/[id]/complete-action
├ ƒ /api/sessions/[id]/frame
├ ƒ /api/sessions/[id]/frame-sequence
├ ƒ /api/sessions/[id]/guidance
├ ƒ /api/sessions/[id]/locale
└ ƒ /follow/[routeId]

○ (Static) prerendered as static content
ƒ (Dynamic) server-rendered on demand
```

HTTP smoke attempt: `node scripts/smoke-api.mjs 3119` invokes isolated `next start` — exit 1 before any request:

```text
⨯ Failed to start server
Error: listen EPERM: operation not permitted 0.0.0.0:3119
    at <unknown> (Error: listen EPERM: operation not permitted 0.0.0.0:3119)
    at new Promise (<anonymous>) {
  code: 'EPERM',
  errno: -1,
  syscall: 'listen',
  address: '0.0.0.0',
  port: 3119
}
Error: next start exited (1). Is port 3119 free and the app built?
    at startIsolatedServer (scripts/isolated-server.mjs:24:39)
    at async scripts/smoke-api.mjs:6:18
Node.js v24.11.1
```

The changed-route HTTP smoke and phone/desktop render inspection remain unverified. No screenshot or real-device success is claimed.

Supplemental compiled-handler check: `node /private/tmp/breadcrumb-actions-handlers.cjs` — exit 0. A temporary script creates isolated storage, loads Webpack route modules and calls their exported methods with native `Request` and `Response`. This exercises actual validation/handlers/core but is **not** an HTTP smoke against `next start`. Exact output:

```text
PUT routes/[id]/draft 400 INVALID_INPUT
PUT routes/[id]/draft 200 draft
POST routes/[id]/approve 400 INVALID_INPUT
PUT routes/[id]/draft 200 draft
POST routes/[id]/approve 409 NOT_APPROVED
POST routes/[id]/approve 200 approved
PUT routes/[id]/draft 409 STALE_VERSION
POST sessions 503 PROVIDER_UNAVAILABLE
POST sessions 200 ok
POST sessions/[id]/complete-action 400 INVALID_INPUT
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/complete-action 400 INVALID_INPUT
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 uncertain
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 reorient
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 guiding
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/complete-action 409 STALE_VERSION
POST sessions/[id]/complete-action 200 uncertain
POST sessions/[id]/complete-action 409 STALE_FRAME
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/complete-action 400 INVALID_INPUT
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 guiding
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 guiding
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 uncertain
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 uncertain
PATCH sessions/[id]/locale 200 ok
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 guiding
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 reorient
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 guiding
POST sessions/[id]/frame-sequence 200 ok
POST sessions/[id]/frame 200 arrived
compiled route handler check passed (in-process Request/Response; no HTTP listener)
```

`git diff --check` — exit 0, no whitespace diagnostics. Changed Markdown links passed a local existence check. No staged changes existed. The final supplemental Webpack build and compiled-handler checks were repeated after the last stylesheet change; the outputs above are from that final pass.

## Publication failure

Explicit-path `git add` for the owned contract/core/API/UI/knowledge files failed — exit 128:

```text
fatal: Unable to create '/Users/jaydenl/Dev/Hackathon/BigRed 2026/.git/worktrees/detailed-route-actions/index.lock': Operation not permitted
```

The worktree's Git metadata is outside the writable sandbox roots. No index, commit or remote was changed. No push or PR was attempted after the staging failure: the remote cannot receive this uncommitted diff. No merge or deployment occurred. The user's explicit fallback is to leave the diff and report sandbox failures.

## Limits and next action

This is mock state-machine evidence. It does not prove real recognition, physical action completion, terrain safety, accessibility, field navigation or phone camera/audio. Local JSON persistence still supports one process only. The English-only approach description remains a localization limit.

Next: the integration owner reviews the local diff (including the concurrent browser adapter line), runs the normal build with font network access, starts an isolated production server, smokes save/approve and the manual endpoint, and inspects phone/desktop creator/guide states, keyboard focus and error recovery. Then stage explicit authorized paths, commit on this branch, push and open one PR to `main` in `jayclim/BigRed26`. Do not merge. End the PR body with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## Host verification — lead 5d1040e8, 2026-10-03

Earlier lead 7fe84ded ran on the host: `npm run check`, `npm run typecheck` and the normal Turbopack `npm run build` (font network available) passed; the build lists `/api/sessions/[id]/complete-action`. Application source has not changed since, so these were not rerun.

HTTP smoke: lead 7fe84ded sent one request to gpt-6-luna through the native Codex rescue agent (plugin job `task-mus4cgwi-jz3pwa`) to extend `scripts/smoke-api.mjs` only. The request was accepted and produced the smoke diff. The native call omitted `run_in_background` and returned background metadata, so no final native handback was received and dispatch stopped. This lead inspected the diff and ran `node scripts/smoke-api.mjs 3131` on the host against isolated `next start` and temporary data: exit 0, `smoke passed`. Over real HTTP it covers the legacy flow plus, on `action-fixture`: manual completion of an inactive checkpoint → 400 `INVALID_INPUT`; similar door B215 does not select B214; B214 approach → guiding with `direction: null`; wrong route version → 409 `STALE_VERSION`; valid manual completion → 200 with manual evidence, not guiding, `direction: null`; repeated request → 409 `STALE_FRAME`.

Rendered UI: a temporary CDP script adapted from `scripts/screenshots.mjs` (ignored `.overnight/`, no tracked screenshot changed) drove headless Chrome on an isolated server. Captures were inspected at 1280×900 and 390×844. No horizontal overflow at either width. Creator: fixture load, action editor fields (kind, target, side, floor, ordered bilingual steps, completion), approval. Keyboard: Tab focus shows a 3px cyan outline on creator textareas and guide controls. Guide: B215 → uncertain "head back toward Door B214"; B214 → action card with target, side, completion and manual button, no arrow; manual → next action kept uncertain with no arrow; camera lost inside Lift A keeps the action and manual button; recognizer failure keeps the last confirmed step with a recovery notice; Spanish switch keeps position and localizes steps.

UI observations (non-blocking): checkpoint labels such as "Lift A to Floor 3" and "Floor 3" stay English inside Spanish text (fixture data); the uncertain card's icon column narrows the text column on phone. Approach evidence restoring the arrow after a manual step is covered by the core check, not by the rendered run.

Next: independent gpt-6.1-sol review of the PR before merge.
