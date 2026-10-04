# Breadcrumb

Record a route once. Let the next visitor follow it through their camera.

For the shared project brain, start with [AGENTS.md](AGENTS.md), then [CONTEXT.md](CONTEXT.md). See [PROGRESS.md](PROGRESS.md) for current evidence and [the teammate handoff](docs/TEAM-HANDOFF.md) for assignments. Claude Code leads development. Local knowledge, design and verification skills live in `skills/`, discovered by both Claude and Codex.

Breadcrumb works on real data. A route starts from a video you upload, the creator reviews and approves it, and a visitor follows it with the live voice guide or the camera check-view guide. A new data store starts empty: no sample route is added. Gemini extraction, live recognition, the live voice guide and generated voice each need their own server flag and key. Without them the matching feature reports that it is not available. Nothing falls back to fake data. Nothing here shows recognition accuracy or real-device navigation yet.

## Run

Requires Node ≥ 22.18 (tested on Node 24.11.1, npm 11.6.2).

```sh
npm install
npm run dev            # http://localhost:3000
# or a production build:
npm run build && npm start
```

| Command | What it does |
|---|---|
| `npm run check` | Unit checks. They use injected test recognizers and fictional fixtures: approval, reorientation, arrival, stale ordering, provider failure, locale preservation, safe store loading |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/smoke-api.mjs [port]` | HTTP walk-through. Run `npm run build` first. Starts its own server (default port 3107) |
| `node scripts/screenshots.mjs [port] [chromePath]` | Regenerates `docs/screenshots/` with local Chrome and reports horizontal overflow. Run `npm run build` first |
| `npm run reset` | **Destructive:** deletes your `.data/` routes and sessions. Never needed for testing |

The HTTP and browser scripts start the app with `BREADCRUMB_TEST_FIXTURES=1`. Only that test flag seeds the fictional test routes and registers the synthetic test recognizer. Normal runs never set it. Each script gives its server its own `BREADCRUMB_DATA_FILE` inside a fresh `mkdtemp` directory, and Chrome gets its own `mkdtemp` profile. Each script removes only the directories it created. Your `.data/` is never read or changed.

## What works

1. **Landing** (`/`): what Breadcrumb is, how it works, then the route dashboard (`#routes`) and open bounties (`#bounties`) with a **Post a bounty** button. Set `BREADCRUMB_AGENT_CONTACT` (a phone number or Apple ID email) to show how to text the iMessage agent; the page shows no number without it. The logo on every page goes here. `/routes` redirects to `/#routes`; `/bounties` is the full board.
2. **Creator** (`/teach`): `/teach` starts a new route from a video; `/teach?route=<id>` edits a stored route. The old `/?route=<id>` link redirects here. Teach a route by uploading a video, then review the draft. Edit the name, start, destination, English and Spanish instruction and the direction for each step, then click **Approve version N**. The click sends every checkpoint id as reviewed; the server still rejects approval unless every checkpoint is listed. The dashboard lists every route with Edit and, once approved, copyable Follow and Live voice guide links.
3. **Bounty to route** (`/teach?bounty=<id>`): **Take this request** on a bounty opens its page and the claim form. After claiming, **Teach this route** opens the creator with the new draft named after the bounty. After approval, **Submit to bounty** uses the claim secret this browser saved, then the poster approves and pays on the bounty page.
4. **Share:** after approval the page shows `http://localhost:3000/follow/<route-id>`. "Edit as version 2" creates a new draft. Version 1 stays immutable, and running sessions keep their version.
3. **Guide** (`/follow/<route-id>`): opens the Gemini Live voice guide. It needs the live guide flag and key; otherwise the page says it is not enabled. `?mode=live` opens the camera check-view guide: a dark camera view whose "Check this view" button sends one frame to the server for recognition. It needs the live recognition flag and key; otherwise starting fails with a clear message.
   - **Camera:** start/stop preview using `getUserMedia` with the rear camera preferred. Handles permission denied (with recovery steps and a retry), no camera or insecure context, and other errors.
   - **States:** *guiding* (cyan arrow), *uncertain* and *reorient* (amber, no arrow), *arrived* (green). A provider failure shows an error banner, and the last confirmed step stays in place; no guessed turn.
   - **Language:** "Español"/"English" switches the session locale on the server, then re-renders the same position in the new language.
   - **Sound:** **browser speech** (`speechSynthesis`). It is off by default, speaks each instruction once, and cancels stale speech. This is not ElevenLabs.
   - A trail of checkpoint dots shows progress.

### Core rules (server, `src/server/core/core.ts`)
- **Runtime validation:** zod schemas (`contracts/schemas.ts`) check every API body. A session id in the path must match the body.
- **Navigation needs approval:** only approved versions can be navigated, and approved versions are immutable.
- **Allowed checkpoints:** a frame can only match the last confirmed checkpoint or the next one. Anything else is *uncertain*.
- **Approach before a turn:** a checkpoint recognized without its approach gives *reorient*, with no arrow and no progress.
- **Unknown scenes:** an unknown scene, or one with no evidence, gives *uncertain*, with no arrow.
- **Arrival:** requires destination evidence plus a confirmed approach at the destination, which must be the next checkpoint.
- **Frame ordering:** the server reserves sequences centrally and checks for stale frames twice: before recognition and again at commit, after the `await`. An older frame that resolves late gets `409 STALE_FRAME` and cannot regress state.
- **Provider failures** return `503 PROVIDER_UNAVAILABLE` and record a `provider_error` event. They never produce guidance.
- **No fallback:** asking for a session mode with no registered recognizer returns `503`. Production registers only `live`, and only when enabled. Nothing falls back to fake data.
- **Events:** every frame is recorded as a `NavigationEvent` with its mode and route version. `GET /api/routes/:id/quality` defaults to `mode=live`.

### Persistence
State is kept in `.data/store.json` (override with `BREADCRUMB_DATA_FILE`) and is written atomically on each change. It survives restarts. This is single-process only; don't run two servers on the same file.

A missing file starts an empty store. If the file can't be read, isn't valid JSON, or doesn't look like Breadcrumb data:
- it is left untouched;
- the server logs the reason;
- every API call returns `503 PROVIDER_UNAVAILABLE` with that reason.

Fix or move the file, then restart.

## Localhost vs phone
- **This computer:** `http://localhost:3000` is a secure context, so the camera works.
- **Another phone:** browsers allow the camera only over **HTTPS**. A plain `http://<LAN-IP>:3000` will load, but the camera reports it is unavailable (the app shows that message). Options for the next milestone:
  - `next dev --experimental-https -H 0.0.0.0`: a self-signed certificate that the phone has to accept.
  - A tunnel or a deployment. That needs an explicit team decision; nothing has been deployed.

## Limitations
- **Not proven:** nothing here shows recognition accuracy or real-device navigation.
- **Recognition rules:** one frame is enough to change state. The kit's "two consistent frames" heuristic is still to be tuned on real footage.
- **Untranslated text:** `approachDescription` and checkpoint labels are English-only in contract v1, so Spanish reorient text includes English fragments.
- **Missing endpoints:** no help or manual-advance control yet. No upload or build endpoints; `startBuild` returns `PROVIDER_UNAVAILABLE`.
- **Quality:** a quality view UI doesn't exist yet (the endpoint does).
- **No accounts or auth:** anyone who can reach the server can edit routes.

## Next live milestone
- **Gemini:** checkpoint extraction from one real 45–90 s route video, and a live `Recognizer` registered in `src/server/core/instance.ts` (`recognizers.live`).
- **Real-footage checks:** independent second-phone footage, an unrelated view, and wrong-facing evidence.
- **Voice:** ElevenLabs `VoiceAdapter` plus `POST /api/speech`.
- **Phone access:** an HTTPS origin for phones.
- **Later:** Photon and Tiger Data, only after the core route works.

Environment variable names are reserved but not read yet, apart from `BREADCRUMB_DATA_FILE`:
- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- `ENABLE_VOICE`, `ENABLE_PHOTON`, `ENABLE_QUALITY_VIEW`
- `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET`
- `DATABASE_URL`

Keep them in an ignored `.env.local`.

## Stack
Next.js 16.3.8 (App Router, Turbopack), React 19.3.0, zod 4.6.5, TypeScript 5.9.3. TypeScript is pinned to 5.x because Next's build-time type check uses the TypeScript JS API, which 7.x may not provide. The core check runs directly with Node's built-in TypeScript stripping, with no test framework.
