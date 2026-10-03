---
name: breadcrumb-verify
description: Verify Breadcrumb changes or demo readiness with core and build checks plus an observed creator-to-guide journey, distinguishing mock coverage from real-device evidence.
---

# Verify Breadcrumb

Use project-root paths; canonical skill location is `skills/breadcrumb-verify/`. Read `package.json`, the current build output and relevant [architecture invariants](../../knowledge/architecture.md#navigation-invariants). Inspect the change before choosing checks.

For the initial baseline, run `npm run check`, `npm run typecheck` and `npm run build`. Later narrow edits need only relevant checks; broaden on failures or new risks. Use actual package scripts if names change.

Reuse `node scripts/smoke-api.mjs` and `node scripts/screenshots.mjs` after a build for isolated HTTP checks and local Chrome captures. Each starts its own server with temporary data; they do not require `npm run reset`. `node scripts/isolated-server.check.mjs` checks occupied-port isolation when that helper changes. Prefer available host browser tools for one-off inspection.

Exercise draft edit/review, approval, session, explicit mock entrance/turn, unknown view, unconfirmed approach, locale change and arrival. Check stale ordering and provider failure with the core check. Verify the shared route opens. Watch browser errors and overflow. Exercise denied-camera recovery when possible; desktop simulation does not count as a phone test.

Record commands, outcomes, mode, environment, screenshots and untested cases in the verification output. Preserve user data; do not reset storage for a clean test. Fix within ownership or send a reproduction to the lead. Live acceptance requires actual provider and second-phone evidence.
