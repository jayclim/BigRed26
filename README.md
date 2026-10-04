# Breadcrumb: local mock MVP

Record a route once. Let the next visitor follow it through their camera.

For the shared project brain, start with [AGENTS.md](AGENTS.md), then [CONTEXT.md](CONTEXT.md). See [PROGRESS.md](PROGRESS.md) for current evidence and [the teammate handoff](docs/TEAM-HANDOFF.md) for assignments. Claude Code leads development. Local knowledge, design and verification skills live in `skills/`, discovered by both Claude and Codex.

**This build is MOCK only.** The sample route ("Example entrance to room 204") is fictional content from `breadcrumb-kit/fixture.json`. No video has been recorded, nothing does image recognition, and no Gemini, ElevenLabs, Photon or Tiger Data calls exist. Guidance comes from *synthetic observations that a person picks explicitly*. These go through the real server-side route and session rules.

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
| `npm run check` | Core check: approval, unknown scene, reorientation, arrival, stale ordering, provider failure, locale preservation, safe store loading |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/smoke-api.mjs [port]` | HTTP walk-through. Run `npm run build` first. Starts its own server (default port 3107) |
| `node scripts/screenshots.mjs [port] [chromePath]` | Regenerates `docs/screenshots/` with local Chrome and reports horizontal overflow. Run `npm run build` first |
| `npm run reset` | **Destructive:** deletes your `.data/` routes and sessions. Never needed for testing |

Both scripts give their server its own `BREADCRUMB_DATA_FILE` inside a fresh `mkdtemp` directory, and Chrome gets its own `mkdtemp` profile. Each script removes only the directories it created. Your `.data/` is never read or changed.

## What works

1. **Creator** (`/`): the route opens as **draft v1**. Edit the English and Spanish instruction and the direction for each step, then click **Approve version N**. The click sends every checkpoint id as reviewed; the server still rejects approval unless every checkpoint is listed. **All routes** (`/routes`) lists every route with Edit (`/?route=<id>`) and, once approved, copyable Follow and Live voice guide links.
2. **Share:** after approval the page shows `http://localhost:3000/follow/demo-route`. "Edit as version 2" creates a new draft. Version 1 stays immutable, and running sessions keep their version.
3. **Guide** (`/follow/demo-route`): a dark camera view. A **Mock** label and "Camera not analyzed" sit on the camera area. The mock panel says the building is fictional.
   - **Camera:** start/stop preview using `getUserMedia` with the rear camera preferred. Handles permission denied (with recovery steps and a retry), no camera or insecure context, and other errors. The camera area always shows "Mock" and "Camera not analyzed".
   - **Mock observations panel:** a separate, dashed, light-colored panel. Each pick reserves a frame sequence on the server and then submits a frame. The scene options are:
     - "*X*, approached as recorded"
     - "*X*, facing unclear"
     - "Unrelated view"
     - "Recognizer failure"
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
- **No live fallback:** asking for a `live` or `replay` session returns `503`. Nothing falls back to mock.
- **Events:** every frame is recorded as a `NavigationEvent` with its mode and route version. `GET /api/routes/:id/quality` defaults to `mode=live`.

### Persistence
State is kept in `.data/store.json` (override with `BREADCRUMB_DATA_FILE`) and is written atomically on each change. It survives restarts. This is single-process only; don't run two servers on the same file.

The sample route is seeded **only when the file doesn't exist**. If the file can't be read, isn't valid JSON, or doesn't look like Breadcrumb data:
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
- **Not proven:** mock only. Nothing here shows recognition accuracy or real-device navigation.
- **Recognition rules:** one frame is enough to change state. The kit's "two consistent frames" heuristic is still to be tuned on real footage.
- **Untranslated text:** `approachDescription` and checkpoint labels are English-only in contract v1, so Spanish reorient text includes English fragments. The mock observation panel is English-only, since it is a demo control.
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
- `DEMO_INPUT=live|replay|mock`
- `PHOTON_API_KEY`, `PHOTON_WEBHOOK_SECRET`
- `DATABASE_URL`

Keep them in an ignored `.env.local`.

## Stack
Next.js 16.3.8 (App Router, Turbopack), React 19.3.0, zod 4.6.5, TypeScript 5.9.3. TypeScript is pinned to 5.x because Next's build-time type check uses the TypeScript JS API, which 7.x may not provide. The core check runs directly with Node's built-in TypeScript stripping, with no test framework.
