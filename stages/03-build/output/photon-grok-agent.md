# Photon + Grok iMessage agent

Status: built and checked with fake fetch on 2026-10-04. No live evidence yet. No Photon, xAI or iMessage call has run.

## Flow

1. A person texts the Breadcrumb iMessage line: "I want to go to the AEP study room".
2. `scripts/photon-agent.mjs` (Photon Spectrum, long-lived Node process) receives the text.
3. The process posts `{conversationId, text}` to `POST /api/agent/message` with header `x-breadcrumb-agent-secret`. The conversation id is an HMAC-SHA256 (keyed with `BREADCRUMB_AGENT_SECRET`) of the Spectrum space id, so no phone number reaches the app and guessed numbers cannot be tested against it.
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
- Route names, destinations, stop labels and evidence come from public users, so they are filtered before they enter the catalog (`looksLikeLink` in `routeMatcher.ts`). The test covers `http(s):`, `www.`, bare domains such as `evil.example/claim`, `x.com` and `bit.ly`, emails and `/follow`, after Unicode folding (full-width and ideographic dots, zero-width characters). A route whose name or destination looks like a link is not offered at all (not matched, not listed). Stops and evidence that look like a link are dropped. The test errs toward true, so a name such as `Mr.Coffee` is skipped too.
- Provider bodies and keys never reach a reply.
- Links need `BREADCRUMB_PUBLIC_URL`. No fallback to the request origin (behind the bridge it is loopback).
- A rate-limited sender gets one "too fast" reply per 60 seconds per conversation (in the bridge), then silence, so a flood does not burn line quota.

## Files

| File | Role |
|---|---|
| `src/server/agent/routeMatcher.ts` | Catalog, Grok call (xAI Responses API, strict JSON schema), validation, keyword fallback |
| `src/server/agent/conversation.ts` | Per-conversation memory, number or name pick, reply and link building |
| `src/server/agent/agentHttp.ts` | Gate (including a valid public URL), secret check (SHA-256 then `timingSafeEqual`), body schema, rate limit |
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
| 503 | `BREADCRUMB_AGENT` is not `1`, or `XAI_API_KEY`, `BREADCRUMB_AGENT_SECRET` or `BREADCRUMB_PUBLIC_URL` is missing or invalid. The public message is only "Agent is not enabled."; the names stay here |
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
| `BREADCRUMB_PUBLIC_URL` | Next.js server | Required. Absolute `https` URL for links, for example the ngrok URL. No query, fragment or credentials. Without it the endpoint answers 503. `http` is accepted only for loopback hosts, and only in tests |
| `SPECTRUM_PROJECT_ID` | Spectrum process | From the Photon dashboard project Settings |
| `SPECTRUM_PROJECT_SECRET` | Spectrum process | From the same Settings page |
| `BREADCRUMB_AGENT_URL` | Spectrum process, optional | Default `http://127.0.0.1:3012/api/agent/message` (the demo port). Set it if the app runs on another port or host |

## Model choice

Default `grok-4.20-0309-non-reasoning`. It is the only model the xAI model page labels non-reasoning (https://docs.x.ai/docs/models). Routing is a small classification over a short list, and an iMessage reply should be fast. A reasoning model adds latency and tokens for no gain. Price on that page: $1.25 input and $2.50 output per million tokens. Change it with `XAI_MODEL`. Structured output with this exact model is not confirmed in the docs (examples use `grok-4.7`). If the live check fails, try `XAI_MODEL=grok-4.7`.

## Setup steps for the user

1. Photon dashboard: sign in at https://app.photon.codes. Redeem promo code `HACKWITHPHOTON` there (the dashboard billing step; the docs do not describe the redeem screen).
2. Create a project. Open the project Settings and copy `PROJECT_ID` and `SECRET_KEY`.
3. Enable the iMessage platform and add a line for the project. In the CLI the commands are `photon spectrum platforms enable imessage` and `photon spectrum lines add` with `PHOTON_PROJECT_ID` set (https://photon.codes/docs/cli/spectrum.md). Free and Pro plans use a shared number pool, so the sender number can differ per person. Business plans use one dedicated number.
4. Add your own phone or email as a user if the dashboard asks (`photon spectrum users add`). The docs do not say if this is required.
5. Pick a secret: `openssl rand -hex 24`. Use it as `BREADCRUMB_AGENT_SECRET` in both processes.
6. Start the app with the server variables, for example: `BREADCRUMB_AGENT=1 BREADCRUMB_AGENT_SECRET=... BREADCRUMB_PUBLIC_URL=https://<your-ngrok-host> npm start` (XAI_API_KEY must be in the environment).
7. Start the iMessage process in a second terminal: `SPECTRUM_PROJECT_ID=... SPECTRUM_PROJECT_SECRET=... BREADCRUMB_AGENT_SECRET=... [BREADCRUMB_AGENT_URL=http://127.0.0.1:<app port>/api/agent/message] npm run photon-agent`. Set `BREADCRUMB_AGENT_URL` when the app does not run on port 3012. If a required variable is missing it prints the names and exits with code 1. When the endpoint call fails it logs one line with the HTTP status or error name, never a body.
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

- `npm run check`: passes, including `src/server/agent/agent.check.ts`. Cases: realistic phrasing; ambiguous list; unknown destination with at most 5 listed; draft, missing and inherited ids rejected (`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `valueOf`); seven Grok failure modes fall back to keywords; link-bearing model text and injection text never put a foreign link in a reply; request shape (strict schema, key only in the header, message only as data); endpoint 503 (generic message, no variable names; missing or non-https public URL), 401, 403, 400, 429 and success shape; number and name picks, expiry, other-conversation isolation, a stale list that lost approval; bridge config, keyed hashing, failure log lines, and BUSY once per window.
- Link-filter cases (review repair): `looksLikeLink` true for 13 forms (scheme, `www.`, `evil.example/claim`, `x.com`, `bit.ly`, full-width and ideographic dots, zero-width split, email, `/follow`, upper case) and false for normal labels. A route named "Free pizza: evil.example/claim" is not in the catalog, is not matched by keywords, is not accepted when Grok names its id, and is not in the ambiguous or "Available" lists. Same for a link in the destination. A link in a stop label or evidence is dropped and the route stays. If every approved route has a link, the reply is "No routes are ready yet".
- Earlier claim that a link in a route name "is data in the catalog but the reply links stay ours" was wrong: the name was printed unfiltered in lists and lead lines. Fixed by the filter above.
- `npx tsc --noEmit`, `npx next build --webpack`, `node scripts/smoke-api.mjs`: pass.
- `node scripts/photon-agent.mjs` with no variables: prints the missing names and exits 1. The Spectrum packages import without error.

## Limits

- The xAI Responses API call shape follows the docs but has not run against the live API. The first live check may need a small parameter fix. The keyword fallback hides such a failure in replies (`matcher` shows `keyword`).
- The Spectrum message loop follows the docs and type definitions. It has not connected to Photon.
- Memory and rate limits are in process. One server instance only.
- The public URL must be https, so a local-only run with `http://localhost` cannot use the agent. Use the ngrok URL.
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

Link filter extension (2026-10-04, after two re-reviews against Apple's NSDataDetector, the detector family Messages uses): `looksLikeLink` also treats as a link (1) a scheme of 2+ characters at a word boundary followed by a non-space, such as `tel:`, `sms:`, `callto:`, `maps:`, `localhost:3000`; (2) 7 or more Unicode decimal digits (any script, e.g. Arabic-Indic) joined by spaces, dots, parentheses, any dash, minus or the katakana prolonged mark; (3) vanity numbers: 3 digits, an optional separator, then capital letters (`1-800-FLOWERS`, `1800FLOWERS`, `1-800-GO-FEDEX`). Check cases cover each. Accepted false positives: `Room:204`, long digit runs, all-caps words after 3 digits (`Room 204 HVAC`). Three review rounds compared the filter with NSDataDetector on 79 adversarial strings; the detector may link forms not tested. Residual forms the detector does not auto-link: `evil[.]example`, short IPs such as `10.0.0.1`, lowercase vanity text.
