# Photon + Grok iMessage agent

Status: built and checked with fake fetch on 2026-10-04. No live evidence yet. No Photon, xAI or iMessage call has run.

## Flow

1. A person texts the Breadcrumb iMessage line: "I want to go to the AEP study room".
2. `scripts/photon-agent.mjs` (Photon Spectrum, long-lived Node process) receives the text.
3. The process posts `{conversationId, text}` to `POST /api/agent/message` with header `x-breadcrumb-agent-secret`. The conversation id is a SHA-256 hash of the Spectrum space id, so no phone number reaches the app.
4. The endpoint loads the approved routes from core, asks Grok to choose, validates the answer, and builds the reply.
5. The process sends the reply as an iMessage.

Reply rules:

| Case | Reply |
|---|---|
| One clear match | Short line, then the live voice link `<PUBLIC_URL>/follow/<routeId>?mode=stream`, then the classic link `<PUBLIC_URL>/follow/<routeId>` |
| Several possible | Numbered list (max 5). Reply "2" or a name to pick. Memory: in process, 10 minutes, 500 conversations |
| No match | "I could not find that destination", then up to 5 available routes (also pickable by number) |
| Grok fails or times out | Keyword match over names, destinations, stop labels and evidence. The agent still answers |

Safety rules:

- Only routes with an approved version are in the catalog (newest approved version). Drafts and inherited names such as `__proto__` are never offered.
- The user message and route text go to Grok as JSON data in the user turn. The system prompt is fixed.
- Grok output is checked against the real approved ids. Unknown ids are dropped. If nothing real remains, the keyword fallback runs.
- Links are built only in `src/server/agent/conversation.ts` from a validated id. The model sentence is shown only if it has no URL-like text, and only for the ambiguous case or a match.
- Provider bodies and keys never reach a reply.

## Files

| File | Role |
|---|---|
| `src/server/agent/routeMatcher.ts` | Catalog, Grok call (xAI Responses API, strict JSON schema), validation, keyword fallback |
| `src/server/agent/conversation.ts` | Per-conversation memory, number or name pick, reply and link building |
| `src/server/agent/agentHttp.ts` | Gate, secret check (SHA-256 then `timingSafeEqual`), body schema, rate limit |
| `src/app/api/agent/message/route.ts` | Node runtime route |
| `src/server/agent/photonBridge.ts` | Config check and forward call for the Spectrum process |
| `scripts/photon-agent.mjs` | The Spectrum process (`npm run photon-agent`) |
| `src/server/agent/agent.check.ts` | Checks, added to `npm run check` |
| `scripts/smoke-api.mjs` | Added: endpoint returns 503 while disabled |
| `knowledge/reuse.md` | Spectrum and xAI entries (source, version, license) |

## Endpoint

`POST /api/agent/message`, body `{conversationId, text}` (strict; text 1 to 500 chars; body max 4096 bytes).

| Status | Cause |
|---|---|
| 503 | `BREADCRUMB_AGENT` is not `1`, or `XAI_API_KEY` or `BREADCRUMB_AGENT_SECRET` is missing |
| 401 | Header `x-breadcrumb-agent-secret` missing |
| 403 | Header wrong |
| 400 | Invalid body |
| 429 | Over 6 per minute or 60 per hour per conversation, or 60 per minute in total |
| 200 | `{ok:true, reply, routeId|null, links:{stream,classic}|null, matcher:"grok"|"keyword"|"memory"|"none"}` |

Errors use the project shape `{ok:false, error:{code, message, retryable}}`.

## Environment variables

| Name | Where | Purpose |
|---|---|---|
| `BREADCRUMB_AGENT` | Next.js server | `1` enables the endpoint |
| `XAI_API_KEY` | Next.js server | xAI key. Never printed or logged |
| `XAI_MODEL` | Next.js server, optional | Default `grok-4.20-0309-non-reasoning` |
| `BREADCRUMB_AGENT_SECRET` | Next.js server and Spectrum process | Shared secret. Use a long random value |
| `BREADCRUMB_PUBLIC_URL` | Next.js server | Base for links, for example the ngrok URL. Falls back to the request origin, which behind a tunnel is usually `localhost`, so set it |
| `SPECTRUM_PROJECT_ID` | Spectrum process | From the Photon dashboard project Settings |
| `SPECTRUM_PROJECT_SECRET` | Spectrum process | From the same Settings page |
| `BREADCRUMB_AGENT_URL` | Spectrum process, optional | Default `http://127.0.0.1:3000/api/agent/message` |

## Model choice

Default `grok-4.20-0309-non-reasoning`. It is the only model the xAI model page labels non-reasoning (https://docs.x.ai/docs/models). Routing is a small classification over a short list, and an iMessage reply should be fast. A reasoning model adds latency and tokens for no gain. Price on that page: $1.25 input and $2.50 output per million tokens. Change it with `XAI_MODEL`. Structured output with this exact model is not confirmed in the docs (examples use `grok-4.7`). If the live check fails, try `XAI_MODEL=grok-4.7`.

## Setup steps for the user

1. Photon dashboard: sign in at https://app.photon.codes. Redeem promo code `HACKWITHPHOTON` there (the dashboard billing step; the docs do not describe the redeem screen).
2. Create a project. Open the project Settings and copy `PROJECT_ID` and `SECRET_KEY`.
3. Enable the iMessage platform and add a line for the project. In the CLI the commands are `photon spectrum platforms enable imessage` and `photon spectrum lines add` with `PHOTON_PROJECT_ID` set (https://photon.codes/docs/cli/spectrum.md). Free and Pro plans use a shared number pool, so the sender number can differ per person. Business plans use one dedicated number.
4. Add your own phone or email as a user if the dashboard asks (`photon spectrum users add`). The docs do not say if this is required.
5. Pick a secret: `openssl rand -hex 24`. Use it as `BREADCRUMB_AGENT_SECRET` in both processes.
6. Start the app with the server variables, for example: `BREADCRUMB_AGENT=1 BREADCRUMB_AGENT_SECRET=... BREADCRUMB_PUBLIC_URL=https://<your-ngrok-host> npm start` (XAI_API_KEY must be in the environment).
7. Start the iMessage process in a second terminal: `SPECTRUM_PROJECT_ID=... SPECTRUM_PROJECT_SECRET=... BREADCRUMB_AGENT_SECRET=... npm run photon-agent`. If a variable is missing it prints the names and exits with code 1.
8. Text the line, for example "I want to go to the AEP study room". The route must be approved first (see `/routes`).

A line added while the process runs is not picked up until the next token renewal. Restart the process after adding a line (https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing.md).

## Documentation used (read 2026-10-04)

- Photon home: https://photon.codes (Spectrum overview, links to docs, repo and dashboard)
- Spectrum repo, MIT: https://github.com/photon-hq/spectrum-ts
- Intro: https://photon.codes/docs/spectrum-ts/introduction.md
- Getting started (credentials, message loop, `space.responding`): https://photon.codes/docs/spectrum-ts/getting-started.md
- iMessage provider: https://photon.codes/docs/spectrum-ts/providers/imessage.md
- Connection and routing (lines, quotas): https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing.md
- Messages (`direction`, `content.type`, `reply`): https://photon.codes/docs/spectrum-ts/messages.md
- CLI: https://photon.codes/docs/cli/spectrum.md
- npm registry (`npm view`): `spectrum-ts`, `@spectrum-ts/core` and `@spectrum-ts/imessage` 12.10.1, MIT
- xAI structured outputs: https://docs.x.ai/docs/guides/structured-outputs
- xAI models and pricing: https://docs.x.ai/docs/models
- xAI API reference (Responses API, `max_output_tokens`): https://docs.x.ai/docs/api-reference

Spectrum is a long-lived process (gRPC stream to Photon cloud with project credentials), not a webhook that Photon calls. No public URL is needed for the Spectrum side. The public URL is needed only because the person opens the links on a phone.

## Checks (2026-10-04, worktree `photon-grok`)

- `npm run check`: passes, including `src/server/agent/agent.check.ts`. Cases: realistic phrasing; ambiguous list; unknown destination with at most 5 listed; draft, missing and inherited ids rejected (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`); seven Grok failure modes fall back to keywords; link-bearing model text and injection text never put a foreign link in a reply; request shape (strict schema, key only in the header, message only as data); endpoint 503, 401, 403, 400, 429 and success shape; number and name picks, expiry, other-conversation isolation, a stale list that lost approval; bridge config, hashing and failure replies.
- `npx tsc --noEmit`, `npx next build --webpack`, `node scripts/smoke-api.mjs`: pass.
- `node scripts/photon-agent.mjs` with no variables: prints the missing names and exits 1. The Spectrum packages import without error.

## Limits

- The xAI Responses API call shape follows the docs but has not run against the live API. The first live check may need a small parameter fix. The keyword fallback hides such a failure in replies (`matcher` shows `keyword`).
- The Spectrum message loop follows the docs and type definitions. It has not connected to Photon.
- Memory and rate limits are in process. One server instance only.
- No accessibility or language handling beyond what Grok does with the message. Replies are English.
- The matcher sends route names, stop labels and short evidence to xAI. Route text is not secret in this app, but note it.
- `npm audit` reports 13 moderate findings in OpenTelemetry packages that Spectrum depends on.
- The dashboard "Text Breadcrumb" note is skipped: it needs the real phone number, which is not known yet.
- `PROGRESS.md` is not updated here. The merger reconciles it.

## Next action

The lead runs the live checks (below), then the user does the Photon steps. If `matcher` is `keyword` for a clear request, inspect the xAI response shape or try `XAI_MODEL=grok-4.7`.

Live check, Grok only (reads `XAI_API_KEY` from the environment; prints `null` on any failure):

```sh
node --input-type=module -e "import { askGrok } from './src/server/agent/routeMatcher.ts'; const catalog=[{id:'aep-study',name:'To the AEP study room',destination:'AEP Study Room',stops:['Lobby'],evidence:[]},{id:'lib-cafe',name:'To the library cafe',destination:'Library Cafe',stops:[],evidence:[]}]; console.log(JSON.stringify(await askGrok('I want to go to the AEP study room', catalog, { config: { apiKey: process.env.XAI_API_KEY, model: process.env.XAI_MODEL } })));"
```

Live check, endpoint (server running with the variables above):

```sh
curl -s http://localhost:3012/api/agent/message -H 'content-type: application/json' -H "x-breadcrumb-agent-secret: $BREADCRUMB_AGENT_SECRET" -d '{"conversationId":"live-1","text":"I want to go to the AEP study room"}'
```
