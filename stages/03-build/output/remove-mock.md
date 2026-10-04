# Remove mock from the product

Date: 2026-10-04. Branch: `feat/remove-mock`. Base: `7015f0b`.
Evidence status: local checks, a production-mode server and a headless Chrome run. No physical device and no live Gemini call.

## What was removed

- **Guide.** The mock mode, `MockPanel`, the synthetic-observation buttons, the "Mock" and "Replay" badges and notes (English and Spanish), and `?mode=mock` and `?mode=replay`. Replay had no recognizer and no data source, so it only ever failed. `GuideScreen` is now the camera check-view guide only and always starts a `live` session.
- **Routing.** `/follow/<id>` now opens the Gemini Live voice guide. `?mode=live` opens the camera check-view guide. Any other `?mode` (including `stream`, `mock`, `replay`) opens the voice guide. Exit links go to `/routes`.
- **Creator.** The "Mock route" badge, the fictional-fixture notice, the "Testing tools" panel and the "Review detailed-action mock fixture" button.
- **Home page.** `/` without `?route=` redirects to `/routes`. It no longer loads `demo-route`.
- **Server.** A new store starts empty. The `mock` recognizer is no longer registered in `src/server/core/instance.ts`. Error and API messages no longer say "mock milestone" or "Choose mock explicitly".
- **CSS.** `.mock-panel`, `.scene*`, `.mock-badge`, `.creator-test-tools`, the `mock` and `replay` badge colors.
- **Screenshots.** The old guide screenshots (03 to 12) showed the mock panel. They were replaced by five new ones.
- **Docs.** README, `knowledge/architecture.md`, `design-system.md`, `product.md`, `reuse.md`, `contracts/AMENDMENTS.md` and the design and verify skills no longer describe mock as product behavior.

## What remains, and why

- `Mode` and `ModeSchema` keep the value `mock` (and `replay`). Removing it would break the contract for no gain. Production registers no recognizer for it, so a `mock` session returns `503 PROVIDER_UNAVAILABLE`. Checked on a production server without the flag.
- Synthetic recognizers moved to `src/server/testing/` (`mockScenes.ts`, `actionFixture.ts`). The UI-only `mockScenes()` list was deleted. The `mock:<checkpoint>:<kind>` media ids and the `mock` mode key stay as the test-double protocol, so `core.check.ts` and the contract fixtures are unchanged.
- `BREADCRUMB_TEST_FIXTURES=1` seeds `demo-route` and `action-fixture` and registers the test recognizer. Only `scripts/isolated-server.mjs` (and the Windows variant in `scripts/voice-fixture.mjs`) sets it. This lets `smoke-api.mjs` and `follow-frames.check.mjs` run unchanged against a real HTTP server.
- Existing stores that already contain `demo-route` or `action-fixture` keep them. No data is deleted.
- `git grep -i mock -- src/app src/features src/ui` returns no hits. The page title "Breadcrumb (mock)" in `src/app/layout.tsx` was also fixed. Remaining hits elsewhere are test files, `src/server/testing/`, `contracts/`, scripts and receipts.

## Other changes

- Agent links: the "classic" link is now `/follow/<id>?mode=live`, because the plain path is now the voice guide. `agent.check.ts` follows.
- The voice guide page now uses the guide page stylesheet. On a 390 px phone its header controls overflowed the screen; they now wrap.
- The "Use live voice guide" link in the check-view guide points to `/follow/<id>`.

## Checks (2026-10-04)

`npm run check`, `npx tsc --noEmit`, `npx next build --webpack`, `node scripts/smoke-api.mjs`, `node scripts/follow-frames.check.mjs`, `node scripts/follow-camera.check.mjs` (Chrome) and `git diff --check` pass. `follow-camera.check.mjs` now checks that the default page is the voice guide with no mock label or panel, that `?mode=mock` and `?mode=replay` also open it, and that production `?mode=live` fails honestly. A production server started without the flag returned `[]` from `/api/routes`, `503` for a `mock` session, and `307` to `/routes` for `/`. `scripts/screenshots.mjs` reports no horizontal overflow.

## Limits

- `src/app/routes/page.tsx` (another worker) still shows both a "Follow" link (`/follow/<id>`) and a "Live voice guide" link (`?mode=stream`). Both now open the voice guide. The "Follow" link should become the check-view link (`?mode=live`) or be removed.
- The voice guide and the check-view guide still need their server flags and keys. Without them they say so. This was not tested with a real Gemini key.
- No physical-device or accessibility evidence was added.

Next action: update the route dashboard links; test the default voice guide with a real key on a phone.
