# Creator draft extraction: slice 2b-2

Status: implemented by worker (gpt-6.1-sol, agent `aed5eb6ebf02e5cbd`); host-verified by the lead on 2026-10-03 (lead session `a6165a41`): core, typecheck, normal build and 58/58 rendered fixture checks passed. Branch `feat/creator-extraction-ui`, base `3d1cb40`. Fixture-only evidence; no live provider call.

## Behavior and decisions

- A stored video keeps its file name and offers **Create draft from this video**. The media UUID and disconnected-feature text are removed.
- CreatorScreen owns extraction state. It POSTs to the existing media extraction endpoint. One AbortController and an incrementing token prevent overlapping requests and discard stale responses. Cancel, fixture selection, new version, route-prop changes and unmount abort the request. Progress has no invented percentage. The primary control is disabled and has `aria-busy` during extraction.
- Unsaved edits require **Save draft first**, **Discard edits and create draft**, or **Keep my edits**. Save-first checks for edits made during the save. Edits made during extraction hold a successful draft behind **Open new draft (discard my edits)** and **Keep my edits**. A failed extraction preserves the current route and edits.
- Success opens the saved draft, clears step reviews, sets its guide path and focuses the route heading. Human review of every step is required before approval. Existing bilingual instruction and action fields keep literal target text visible and editable. Saving and approval cannot race a running extraction.
- Only the two known fixture route IDs show the mock badge and fictional-fixture notice. Extracted drafts show **Draft from your video. Check every step; nothing is approved yet.** After manual approval, the notice states that the version was approved. Server errors have `role=alert`, **Retry** and **Dismiss**.
- Reused React, native fetch/abort, existing fields and `.btn`, `.notice`, `.step` styles. Only two small CSS rules were added for wrapping and focus. No dependencies, backend or contracts changed. The stored-video panel stays mounted across route changes so the stored file name remains available.

## Observed checks

Commands ran only in this worktree. The default shell selected Node 19.8.1. Retried required checks with `/Users/jaydenl/.nvm/versions/node/v24.11.1/bin` first in PATH.

| Check | Exit | Observed result |
|---|---:|---|
| `npm run check`, default Node 19 | 1 | `ERR_UNKNOWN_FILE_EXTENSION` for the core `.ts` check. |
| `npm run check`, Node 24 | 0 | Core and media checks passed; extraction checks passed, 32 cases, no network calls. |
| `npm run typecheck` | 0 | `tsc --noEmit`, no diagnostics. Repeated after final UI changes with Node 24. |
| `npm run build`, default Node 19 | 1 | Next.js requires Node >=20.9.0. |
| `npm run build`, Node 24 | 1 | Existing `next/font` fetch failed for Atkinson Hyperlegible at `fonts.googleapis.com`. Dynamic filesystem tracing warnings came from existing backend files. No application compile error was reported before the font failure. |
| `git diff --check` | 0 | No whitespace errors; repeated after receipt updates. |
| `node --check .overnight/ui-extraction.mjs`, Node 24 | 0 | Harness syntax valid. |
| `node .overnight/ui-extraction.mjs`, Node 24 | 1 | Synthetic ffmpeg video creation passed. Server listener blocked: `listen EPERM: operation not permitted 0.0.0.0:3142`. Chrome was not reached. |

## Host checks, lead, 2026-10-03

Host Node 24.11.1, this worktree, no code change after the worker handback.

| Check | Exit | Observed result |
|---|---:|---|
| `npm run check` | 0 | Core, media and 32 extraction cases passed. |
| `npm run typecheck` | 0 | No diagnostics. |
| `npm run build` | 0 | Compiled; font fetch succeeded on the host network. |
| `node .overnight/ui-extraction.mjs` | 0 | `RESULT PASS`, 58 PASS lines, 0 FAIL, cases (a)–(f) at 390 and 1280. |

The lead inspected the phone and desktop captures for the disabled-endpoint alert with Retry/Dismiss, the injected draft (heading focus, honest draft notice, no mock badge), the busy state with Cancel and disabled controls, and the held-draft choice after edits during extraction. No clipping or horizontal overflow was visible. `Invalid InterceptionId` log lines after Cancel and fixture switch are expected: the browser aborted the request, so the intercept no longer existed. Harness limitation: after `RESULT PASS`, its exit handler can raise `ENOTEMPTY` while removing the Chrome temp profile; the exit status stayed 0.

The disabled-provider alert shows the server's existing setup text, including environment variable names but no values.

## Browser coverage and limits

The ignored `.overnight/ui-extraction.mjs` adapts the lead's `ui-media.mjs`. It imports `scripts/isolated-server.mjs` from this worktree, uses port 3142 and writes screenshots to `.overnight/ui-extraction/`. It uses system Chrome via CDP and generates a tiny synthetic test-pattern video. It removes inherited provider enable/key variables without reading credentials. No provider call, environment-file read or extraction enablement occurred.

For injected success, CDP Fetch intercepts `*/api/media/*/extract`. Before fulfillment, it PUTs a clearly named fictional version-1 draft copied from `contracts/fixture.actions.v1.json` into the isolated store. It fulfills `{ok:true,value:<saved route>}`. This verifies the UI and persistence when run; it is not extraction evidence.

| Case | 390 phone | 1280 desktop |
|---|---|---|
| (a) Real disabled endpoint, alert, retry/dismiss, route preserved | PASS (host) | PASS (host) |
| (b) Injected saved draft, honest label, focus, editable literal target, check every step, approve and GET persisted approval/guide path | PASS (host) | PASS (host) |
| (c) Delayed response, busy state/progress, Cancel and late response ignored | PASS (host) | PASS (host) |
| (d) Fixture switch during extraction, release response, fixture retained | PASS (host) | PASS (host) |
| (e) Unsaved guard, save-first persistence, explicit discard, busy edits held, both returned-draft choices | PASS (host) | PASS (host) |
| (f) Keyboard Tab focus visibility | PASS (host) | PASS (host) |

The harness measures horizontal overflow with screenshots in each case. Rendered fit, focus visibility and interactive behavior passed on the host with fixtures. Provider access, live schema acceptance, real-footage extraction and physical navigation remain **UNVERIFIED**. Fixture success is injected via test intercept. No live result is claimed.

Next: an independent [SOL] review of the exact PR head, then the lead merges. After that: Part A checkpoint 3 (approved-route export, legacy/detailed actions, version pinning), and 2b-3 live extraction only after spending caps are confirmed.
