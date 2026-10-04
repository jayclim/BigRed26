# Landing page and bounty to teach flow

Date: 2026-10-04. Worktree `landing`, branch `feat/landing`. Not committed.

## Behavior

- `/` is the landing page: hero, "How it works", the iMessage mention, "Routes" and "Open bounties". `/?route=<id>` redirects to `/teach?route=<id>`.
- The iMessage number shows only when `BREADCRUMB_AGENT_CONTACT` holds a phone number or an email. Other values are ignored. It is public contact data, not a secret. `.env*` files were not changed.
- Routes: approved routes use the existing route card (Live voice guide, Camera check view, Edit). Drafts are compact rows. The card code moved to `src/app/routes/RouteCard.tsx`.
- Bounties: the existing bounty card shows "Take this request" for open bounties. "Post a bounty" opens the existing post form in a modal. The poster secret shows once with a save warning. Escape, the backdrop and Close do nothing until "I saved it".
- `/teach` starts a new route. Before this change the creator needed an existing route id. Now `routeId` is optional: the first extracted draft opens the route, and the address bar changes to `/teach?route=<id>`. Unsaved edits survive that URL change.
- `/teach?bounty=<id>`: a bounty panel shows the request. The new draft takes the bounty title as route name (unsaved until Save or Approve). After approval, "Submit to bounty" calls the existing submit endpoint with the claim secret saved in this browser. If none is saved, the panel asks for it. The bounty page then lets the poster Approve and pay.
- Bounty page: after a claim, "Teach this route" shows for the browser that holds the claim secret.
- The creator has editable route name, start and destination while the route is a draft.
- `/routes` redirects to `/#routes`. `/bounties` stays as the full board. All non-guide pages use `PageShell` and `SiteHeader` (logo to `/`; Routes, Bounties, Teach, Clay). Guide pages: the mark links to `/`; Exit goes to `/#routes`.

## Decisions

- No server or secret check changed. The claim, submit, pay and cancel endpoints are untouched.
- The bounty has no destination field, so only the route name is prefilled. The destination stays from extraction and is editable.
- The hero picture is static and decorative. It is hidden from assistive technology and is not data.
- `/routes` is a redirect (not a copy) to avoid two dashboards.

## Checks (2026-10-04, this machine)

- `npm run check`, `npx tsc --noEmit`, `npx next build --webpack`, `node scripts/smoke-api.mjs`, `node scripts/follow-camera.check.mjs` and `git diff --check` all exit 0.
- Headless Chrome at 390 and 1280 px: `/`, the routes and bounties sections, `/teach`, `/teach?route=`, `/teach?bounty=`, `/bounties`, a bounty page, the post dialog, the live guide and the Clay look. No horizontal overflow. Screenshots were viewed.
- Browser flow with the upload and extraction responses replaced by a stored route: draft opens, URL gains `route`, name equals the bounty title, Save, Approve, "Submit to bounty" moves the bounty to `submitted`. Post dialog shows the secret; Escape keeps it open; "I saved it" closes it. `/?route=x` returns 307 to `/teach?route=x`.
- `scripts/screenshots.mjs` now opens `/teach?route=demo-route` and adds landing and `/teach` shots.

## Limits

- Real video upload and Gemini extraction were not run (no key). Claim with a real Nessie account was not run; the bounty used for the flow was a stored claimed record.
- No physical phone, screen reader or real contrast tool was used. The new text pairs reuse the creator's checked tokens.
- Test fixtures still contain the word "mock" in a fictional route name; they appear only with `BREADCRUMB_TEST_FIXTURES=1`.
- Next action: merger reviews, reconciles `PROGRESS.md`, and checks the flow once with real Gemini and Nessie keys.
