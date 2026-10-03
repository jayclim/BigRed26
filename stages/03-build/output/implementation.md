# Local implementation

Status: local mock MVP implemented and checked, 2026-10-03.

Implemented: route editor/approval, versioned sessions, mock guidance states, locale switching, camera preview/recovery and browser speech. Next.js/React/zod provide the framework and validation. Native browser APIs cover camera and speech; Node supplies the core checks and file storage.

Queue item 2a: [local video upload and storage](media-upload.md) is implemented and host-verified (build, HTTP, browser); extraction remains pending.

Read [Claude's handoff](../../../docs/CLAUDE-HANDOFF.md) for signatures and checks. Persistence now uses `store.ts` to preserve unreadable/corrupt files and report errors. `Brand.tsx` reuses the trail motif. Test scripts share an isolated server, reject occupied ports before probing, and use temporary browser profiles with dynamic debugging ports. Contract changes are recorded in `contracts/AMENDMENTS.md`. No real recognition or provider speech is implemented.
