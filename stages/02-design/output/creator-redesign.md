# Creator redesign

Status: implemented on `feat/creator-redesign` (now based on main `7b8dc3b`, after PR 25 and PR 26 merged). Code checks and the lead's rendered review pass (see Lead verification). Date: 2026-10-03. Source: approved mockups `Creator.dc.html` (desktop) and `CreatorPhone.dc.html` (phone) in the lead's scratchpad. Integration-owner approval: Jayden, 2026-10-03.

## Decisions

Look:
- Light page #fbfbfa. Static glow at the top: cyan rgb(47 208 230 / .30), violet rgb(124 92 255 / .22) and peach rgb(255 160 122 / .22) radial gradients. Desktop 1100×620px centered at top −260px; phone 680×460px at left −140px, top −180px. No animation.
- Ink #14191c, muted #5b6870, rule #e3e6e8 / #e9ecee, action #0a6f82, primary button #14191c, accent tint #e9f7f9 / #064b58, draft badge #fff4dc / #7a4d00. Approved badge keeps the success tokens.
- Secondary text drawn over the glow (header notice, "Teach a route") uses #424e55, so it keeps 4.5:1 where gradients stack.
- Pill controls (999px), 12px fields, 24px video card (22px on phones), 20px preview, testing tools and visitor-link cards. Card shadow `0 18px 50px -24px rgb(20 25 28 / .25)`.
- System font stack. Headings weight 800.

Scope mechanism:
- `src/features/creator/creator.module.css` re-points the global creator tokens and the shadcn semantic tokens on the creator `<main>` only. It overrides global creator classes with `.page :global(...)`. Unlayered module rules win over Tailwind utilities and the `components` layer, so `button.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx` and `theme.css` do not change.
- Default Button variant becomes dark ink through `--primary`; outline is white with a #e3e6e8 border; hover uses the accent tint.

Layout:
- Desktop (>=900px): top bar (brand left; "All routes" link, "Teach a route", mock badge and status badge right). Centered route name, notice text and Start/Destination pills. Large video card (max 760px) under the title. Then two columns: checkpoint rail (left) and a 340px sticky column with the route preview and testing tools (right).
- Tablet (641–899px): one column. Preview and testing tools follow the checkpoints, side by side.
- Phone (<=640px): left-aligned title (32px), stacked fields, 16px input text, approve bar as a 2-column button grid with the count above.
- Sticky bottom bar spans the full width. Its content aligns to the 1116px content width. The step count shows on the left, buttons on the right; the message line wraps below. Only the non-interactive count is moved by CSS `order`; focus order is unchanged.

Checkpoint rail:
- 28px nodes (26px on phones) in a 36px column with 2px connecting rules. Every step of an approved route fills its node and the rule below it with #0a6f82. The destination node stays dark ink.
- Every step stays open with all fields. The mockup collapses unopened steps behind Edit/Review buttons; that would hide edits, so it is not adopted.
- After merging main (PR 26), approval is one explicit Approve click; the per-step review checkboxes and their pill styling are gone. An approved version fills every rail node and rule with the action color.
- The direction tag is an accent-tint pill.

Route preview:
- The guide `RouteMap` inside a dark card (#0f1316) with guide-scoped tokens on the wrapper. `current={-1}`, `guiding={false}`, `flow={false}`: no flow dots, no position marker, no active edge.
- Heading "Route preview" and note "Not to scale" through two new optional `RouteMap` props, `title` and `note`. The image label reads "Route preview, N steps. Not to scale.".
- Statuses are `draft` / `approved`, read only by the sr-only list. Nodes use the neutral style.
- Note text: draft "Drawn from the current draft checkpoints. This draft is not approved."; approved "Drawn from the checkpoints of approved version N.".
- The preview shows at every width. The phone mockup omits it; on phones it follows the checkpoints.

## Markup changes (presentation only)

- `CreatorScreen.tsx`: `<main>` gets the module class, a decorative `aria-hidden` glow div and an inner width wrapper. The status badge moved from beside the heading to the top bar. The video upload moved from the sidebar to a card under the header. The sidebar now follows the route section and holds the preview and testing tools. Its `aria-label` changed from "Teaching video and testing tools" to "Route preview and testing tools", because the video is no longer in it. No script reads that label.
- `VideoUpload.tsx`: heading and description wrapped with a decorative video icon.
- No handler, state or effect changed. No existing text, label, id, role or other aria attribute changed. New text is limited to the preview heading, "Not to scale" and the preview note. The button text "Approve version N" is unchanged. (`.review input` no longer exists since PR 26; `scripts/screenshots.mjs` still clicks it and needs a separate fix on main.)

## States covered by the styles

Loading and load error, draft, unsaved draft, approved with visitor link, new version, mock fixture route, upload (pick, too large, compressing, compressed, stored, upload error), extraction running with Cancel, extraction error with Retry/Dismiss, unsaved-edits guard, held new draft, action editor with ordered steps, disabled approved fields, save/approve messages. These are covered by CSS only; after the merge the lead rendered the All routes page, draft, video selected and approved at 390 and 1280; the other states are styled but not rendered.

## Shared files and guide impact

- `src/features/guide/RouteMap.tsx`: adds optional `title` and `note`. Without them (the guide), output is unchanged.
- `src/ui/*` and `theme.css`: not changed.
- The guide does not import `creator.module.css`, and every creator rule is prefixed with a creator module class. The guide renders as before.

## Checks (2026-10-03, Node 24.21.0)

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | No diagnostics. |
| `node src/features/guide/routeMap.check.ts` | 0 | All PASS. |
| `npm run check` | 0 | All suites passed. |
| `npm run build` | 0 | Compiled; creator module CSS present in the output chunk with local keyframes. |
| `git diff --check` | 0 | No whitespace errors. |

Contrast (computed, not rendered): white on #0a6f82 5.82:1; muted on page 5.54:1; disabled field text 5.29:1; draft badge 6.65:1; accent chip 8.88:1; #424e55 over an upper-bound stack of all three glow peaks 4.97:1; preview note 8.40:1; map todo text 6.16:1.

## Lead verification (2026-10-04, host, Node 24.21.0)

- Pre-merge (before PR 26): rendered with a scratch CDP harness (not committed), one fresh isolated server per width, 390x844 and 1280x900: draft, one step checked, synthetic video selected (`src/features/creator/fixtures/unknown-secondary-audio.mp4`, upload and compress controls shown), all steps checked, approved with visitor link. 10 screenshots, each inspected; no horizontal overflow.
- Found and fixed two defects: (1) "Open guide" (a link rendered as a button) took the creator link color, teal on dark ink, about 2.9:1; links styled as buttons are now excluded from the link color rule. (2) The sticky Save/Approve bar was translucent, so content showed through its text; it is now opaque.
- Pre-merge: Approve stayed disabled until all three steps were checked; "Approve version 1" then produced the approved state and visitor link.
- Guide unchanged: guide renders on this branch are byte-identical to the PR 25 build for the compared states; `node scripts/follow-camera.check.mjs` 8 PASS.
- `npm run check`, `npm run typecheck`, `npm run build` and `node scripts/smoke-api.mjs` pass.
- Not covered here: the ignored creator extraction harness (`.overnight/ui-extraction.mjs`, not in this checkout), extraction success and failure states with injected responses, full keyboard focus walk, and a real phone.

- Pre-merge, review of `d601dd2` (independent, approve): fixed its P2 (later removed with the checkboxes) (keyboard focus on a checked review pill now shows a white outline and an ink ring; confirmed in a render after real Tab key presses, `:focus-visible` true) and P3 notes (video heading weight, sticky column height, stale text here).

- Post-merge (head `ac4b0d3`, host): `npm run check`, `npm run typecheck`, `npm run build`, `node scripts/smoke-api.mjs` and `node scripts/follow-camera.check.mjs` (8 PASS) pass. Rendered at 390 and 1280 on fresh servers: All routes page, draft, synthetic video selected and approved after one Approve click; 8 screenshots inspected, no horizontal overflow. Guide renders: 20, no overflow. An independent review of `ac4b0d3` approved with doc notes only, fixed here.
- Follow-up outside this PR: the All routes page (`src/app/routes/page.tsx`, PR 26) still uses the previous style.

- Merge of `origin/main` `7b8dc3b` (PR 25 squash, PR 26 one-click approve and route dashboard, PR 27 live languages): resolved conflicts by keeping this layout, adding PR 26's "All routes" link to the top bar and its wording, and taking `RouteMap.tsx` from this branch (main's copy equals the PR 25 version). Removed the now-dead review-pill styles and the preview's dependency on review state; the preview's screen-reader status reads draft or approved.

## Limitations

- Not rendered: extraction running, success and error, unsaved extraction guard, upload errors, new version, long route names and short desktop viewports. The sticky column now has a max height and scrolls inside itself, so its bottom stays reachable.
- The bar is opaque (#fbfbfa). An earlier translucent version let content show through its text.
- The preview reuses the guide map's label truncation; long labels truncate with the full text in the sr-only list.

## Next action

Integration owner: run the ignored creator extraction harness on this head (extraction success, failure, cancel and the unsaved-draft guard), then review and merge after PR 25. Then test on a real phone.
