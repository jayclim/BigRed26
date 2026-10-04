# Route dashboard and one-click approval

Date: 2026-10-04. Branch: `feat/one-click-dashboard`. Status: implemented and checked locally; not merged.

## Behavior

- The creator has no per-step review checkboxes. **Approve version N** is one explicit click on the draft. It saves unsaved edits first, then sends every checkpoint id as `reviewedCheckpointIds`. The core still rejects an approval that omits a checkpoint. The button stays disabled while the app is busy, extracting, or holding an extraction notice.
- The approve bar now says "Approving makes version N live for visitors." Copy that told the user to check each step now says "review".
- `/routes` lists every stored route as a card: name, status badge (Approved vN, Draft vN), step count, destination. An approved route shows copyable absolute links (`window.location.origin`): Follow (`/follow/<id>`) and Live voice guide (`/follow/<id>?mode=stream`). Copy uses `navigator.clipboard` with a hidden-textarea fallback. Every card has Edit. Loading, empty and error (with Retry) states exist.
- A route with an approved version and a newer draft shows both badges. The links point at the route id, and visitors get the newest approved version.
- `/?route=<id>` opens any route in the creator. `/` still opens `demo-route`. The creator header has an **All routes** link.
- A route made by video extraction is saved by the server (`saveDraft`), so it appears in `/routes` at once.

## Contract change (AMENDMENT 4)

- New type `RouteSummary` in `contracts/contracts.ts`: `id`, `name`, `latestVersion`, `latestStatus`, `approvedVersion | null`, `checkpointCount`, `destinationLabel`. Built from the latest version.
- New method `CoreAdapter.listRoutes(): Promise<Result<RouteSummary[]>>`. Implemented in `src/server/core/core.ts` (own keys only) and `src/client/httpCore.ts`.
- New endpoint `GET /api/routes` (`src/app/api/routes/route.ts`, Node runtime, Result envelope, `cache-control: no-store`).
- No other method or schema changed. `approveRoute` is unchanged.

## Checks

Run in the worktree on 2026-10-04.

| Check | Result |
|---|---|
| `npm run check` | exit 0. New core case covers empty list, draft, approved, and approved v1 with draft v2 |
| `npx tsc --noEmit` | exit 0 |
| `npx next build --webpack` | exit 0. `/routes` and `/api/routes` are in the route table |
| `node scripts/smoke-api.mjs` | exit 0. Asserts the list includes `demo-route` as draft, then as approved v1 after approval |
| `git diff --check` | exit 0 |
| Headless Chrome, 390 px and 1280 px, `/routes`, `/`, `/?route=action-fixture` | No horizontal overflow (`scrollWidth` equals `innerWidth`). No checkboxes. All routes link present. Approve button enabled with no ticks. Screenshots viewed for `/routes` at both widths and the creator at 390 px |

## Limits

- Route summaries have no created or updated time. Route data has no such field, and none was invented.
- After video extraction the address bar stays `/` (or the old `?route=`). A reload opens that URL's route, not the new draft. Open the new draft from `/routes`.
- The clipboard fallback and Copy buttons were not tested on a real phone or over plain HTTP.
- The live guide page still exits to `/`. Not changed, because `src/features/guide/**` belongs to another worker.
- Older receipts (`creator-extraction.md`) still describe the checkbox flow. They are dated evidence.
- The creator screen was not clicked through end to end in a browser with the new approve button. The approve request shape is covered by the core check and the smoke test.

Next action: lead reviews, then merges.
