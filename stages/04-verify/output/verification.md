# Verification

Status: local mock slice checked; live acceptance remains pending, 2026-10-03.

## Knowledge setup — observed by Codex

- Bundled skill validator passed for `breadcrumb-knowledge`, `breadcrumb-design` and `breadcrumb-verify`.
- All 47 local Markdown links in the initial 21-file knowledge/stage/skill set resolved; rerun after final edits.
- Six discovery symlinks resolve to the three canonical skill folders.
- Claude's resumed session initialization lists all three project skills; it read the new context.
- Final check: all three skills valid; 53 local links across 23 documents resolved; every unpacked kit file exactly matched its original zip entry.

## App baseline — reported and recorded by Claude

`npm run check`, `npm run typecheck`, `npm run build` and the HTTP smoke journey passed. Exact outputs and limitations are in [the implementation handoff](../../../docs/CLAUDE-HANDOFF.md). Twelve screenshots cover main states using a fake camera. Codex inspected the creator and guiding screenshots: legible hierarchy and route motif; lengthy explanatory copy warrants refinement.

## Review pass — observed/reported evidence

- Claude's final `check`, `typecheck` and `build` passed. The added storage check covers missing files, read/write roundtrip, unreadable paths and corrupt/foreign/empty JSON without replacing existing bytes. A mutation restoring the bug made it fail; the fix passes.
- Claude captured 12 updated screenshots, with no horizontal overflow at 390px and 1280px. It fixed Spanish control wrapping and camera-denial overlap. Codex inspected the refined guide and permission-denied renders.
- Codex ran `node scripts/isolated-server.check.mjs`: passed; an occupied port receives zero requests from the test runner.
- Codex ran `node scripts/smoke-api.mjs 3108`: passed against unique temporary data, covering approval, unknown/reorient/guiding/arrived, provider error, locale preservation and stale sequence rejection.
- Codex reran `node scripts/screenshots.mjs 3108` after switching to dynamic browser debugging ports: all 12 captures passed without horizontal overflow. The application source was unchanged by that tooling fix.
- Codex started the dev server on loopback port 3000 and opened it in the app browser. The observed page showed Breadcrumb, draft v1, all three editable checkpoints and approval disabled until review. This browser was left open for the user.
- Full-page creator screenshots show the sticky approval bar inside the long capture; inspect the live viewport when evaluating its position.

## Not established

Real recognition, physical-phone operation, audible provider voice, HTTPS deployment and keyboard-only completion. The original kit is synthetic input; mock results do not prove navigation reliability.
