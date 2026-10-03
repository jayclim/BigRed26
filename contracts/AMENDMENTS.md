# Contract amendments (v1 → v1.1)

`contracts/contracts.ts` is a copy of `breadcrumb-kit/contracts.ts` (kit left unchanged). Amendments:

1. **`approveRoute(routeId, version, reviewedCheckpointIds)`**. HTTP: `POST /api/routes/:id/approve` with body `{version, reviewedCheckpointIds}`.
   Why: integration.txt requires that "all instructions [are] reviewed", but v1 had no way to express review. The server rejects approval (`409 NOT_APPROVED`) unless every checkpoint id is listed. It also checks that each step has both instructions and a direction (except the destination), and that the single destination is the last step.
2. **`currentGuidance(sessionId)`**. HTTP: `GET /api/sessions/:id/guidance` → `Result<Guidance | null>`.
   Why: `setLocale` returns a `Session`, which has no guidance text. This re-renders the last accepted decision in the session's current locale. It runs no recognition and allocates no sequence, so changing language cannot move position.

These are not type changes, just conventions:
- **Mock media ids:** `mock:<checkpointId>:approach`, `mock:<checkpointId>:unknown-approach`, `mock:unrelated`, `mock:provider-error` (see `src/shared/mockScenes.ts`). They are valid only in `mode: 'mock'` sessions.
- **`startSession` with a mode that has no recognizer** (currently `live` and `replay`) returns `503 PROVIDER_UNAVAILABLE`. Nothing falls back to mock.
- **Saving a draft** at `version = latest approved + 1` creates the next version. Saving over an approved version returns `409 STALE_VERSION`.
