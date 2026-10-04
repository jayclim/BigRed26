<div align="center">

# 🍞 Breadcrumb

**Lost indoors? Follow a voice that can see.**

Teach a short indoor route once with a walk-through video. Anyone can then follow it with a live voice guide that watches their camera.

[![Live demo](https://img.shields.io/badge/Live_demo-iamlostwheredoigo.us-0a6f82?style=for-the-badge&logo=googlechrome&logoColor=white)](https://iamlostwheredoigo.us)

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3e67b1?style=flat-square&logo=zod&logoColor=white)
![Node.js](https://img.shields.io/badge/Node_24-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white)
<br>
![Gemini](https://img.shields.io/badge/Gemini_Live-8e75b2?style=flat-square&logo=googlegemini&logoColor=white)
![Grok](https://img.shields.io/badge/xAI_Grok-111111?style=flat-square&logo=x&logoColor=white)
![iMessage](https://img.shields.io/badge/Photon_iMessage-34c759?style=flat-square&logo=imessage&logoColor=white)
![Capital One](https://img.shields.io/badge/Capital_One_Nessie-d03027?style=flat-square)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-000000?style=flat-square&logo=elevenlabs&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare_Tunnel-f38020?style=flat-square&logo=cloudflare&logoColor=white)
![Cursor](https://img.shields.io/badge/Built_with_Cursor_%26_Claude-000000?style=flat-square&logo=cursor&logoColor=white)

<img src="docs/screenshots/06-landing-desktop.png" alt="Breadcrumb landing page" width="820">

</div>

## ✨ What it does

| | |
|---|---|
| 🎥 **Teach** | Upload one walk-through video. Gemini drafts the checkpoints; you review and **approve in one click**. |
| 🗣️ **Follow** | Open the link on a phone. A **Gemini Live** voice guide watches the camera and says where to go next, in **25 languages**. |
| 💬 **Text** | Message the **iMessage agent** (Photon) “how do I get to the study room?”. **Grok** picks the route and replies with the link. |
| 💸 **Earn** | Post a **bounty** for a route you need. A creator teaches it, the poster approves, and payout goes through **Capital One Nessie** (sandbox money). |

<p align="center">
  <img src="docs/screenshots/phone-1-landing.png" alt="Landing on a phone" width="190">
  <img src="docs/screenshots/phone-2-routes.png" alt="Route dashboard" width="190">
  <img src="docs/screenshots/phone-3-voice-guide.png" alt="Live voice guide" width="190">
  <img src="docs/screenshots/phone-4-teach.png" alt="Teach a route" width="190">
</p>

## 🧭 How it works

```mermaid
flowchart LR
  V[🎥 Walk-through video] -->|Gemini extraction| D[📝 Draft route]
  D -->|One-click approve| R[✅ Approved route]
  R -->|/follow link| G[🗣️ Gemini Live voice guide]
  T[💬 iMessage] -->|Photon + Grok| R
  B[💸 Bounty] -->|take request → teach| D
  R -->|submit → approve & pay| N[🏦 Nessie payout]
```

- **Safe by design:** guidance comes only from an approved, immutable route version. No direction is shown before the approach is confirmed, and nothing silently falls back to fake data.
- **Keys stay on the server:** the browser gets a short-lived, route-locked Gemini Live token. Live sessions and bounties are rate-limited.

## 🚀 Quick start

> Requires **Node ≥ 22.18** (tested on 24.11.1).

```sh
npm install
# add your keys to .env.local (see the table below)
npm run dev                  # http://localhost:3000
# production: npm run build && npm start
```

Each provider is off until its flag and key are set. Without them, the matching feature says it is not available.

| Feature | Env |
|---|---|
| 🎥 Video → draft | `BREADCRUMB_GEMINI_EXTRACTION=1`, `GEMINI_API_KEY` |
| 🗣️ Live voice guide | `BREADCRUMB_GEMINI_LIVE=1`, `GEMINI_API_KEY` |
| 📷 Camera check view (`/follow/<id>?mode=live`) | `BREADCRUMB_GEMINI_RECOGNITION=1`, `GEMINI_API_KEY` |
| 💬 iMessage agent | `BREADCRUMB_AGENT=1`, `XAI_API_KEY`, `BREADCRUMB_AGENT_SECRET`, `BREADCRUMB_PUBLIC_URL`, `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET` → run `npm run photon-agent` |
| 💸 Bounties | `BREADCRUMB_BOUNTIES=1`, `NESSIE_API_KEY`, `NESSIE_FUNDING_ACCOUNT_ID`; optional `NESSIE_PAYOUT_MODE` (`auto` default, `transfer`, `ledger`) |
| 🔊 ElevenLabs voice (camera view) | `BREADCRUMB_ELEVENLABS_VOICE=1`, `ELEVENLABS_API_KEY`; optional `ELEVENLABS_VOICE_ID` |

Keep keys in an ignored `.env.local`; never commit them. Phones need **HTTPS** for the camera and microphone; use a tunnel such as Cloudflare Tunnel or ngrok.

## 🧪 Checks

Scripts that start a server need `npm run build` first.

| Command | Purpose |
|---|---|
| `npm run check` | Unit checks for core rules, media, extraction, live guide, agent, Nessie and bounties (no network) |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/smoke-api.mjs` | HTTP walk-through on an isolated server |
| `node scripts/follow-camera.check.mjs` | Headless Chrome guide checks at 390 and 1280 px (macOS Chrome path) |
| `node scripts/screenshots.mjs` | Regenerates `docs/screenshots/` |

Test scripts use their own temporary data and the `BREADCRUMB_TEST_FIXTURES=1` flag. They never touch your `.data/`.

## 🗂️ Project map

| Path | What lives there |
|---|---|
| `src/app/` | Pages (`/`, `/teach`, `/follow/[routeId]`, `/bounties`, `/routes` → `/#routes`) and API routes |
| `src/features/` | Landing, creator and guide UI |
| `src/server/` | Core navigation rules, Gemini, live tokens, agent, Nessie, bounties |
| `contracts/` | Shared types and zod schemas |
| `knowledge/` | [Architecture](knowledge/architecture.md), [design system](knowledge/design-system.md), [product brief](knowledge/product.md) and [reuse and licenses](knowledge/reuse.md) |
| `archive/` | Build-process notes from the hackathon (multi-agent workflow, stage receipts, verification evidence); [not needed to run the app](archive/README.md) |

Contributors and coding agents: see [AGENTS.md](AGENTS.md).

## ⚠️ Limits

- 🧪 Hackathon build: one Node process with a local JSON store and local media. There are no accounts; anyone with the URL can edit routes.
- 💵 Bounty payouts use **Nessie sandbox** money, and the sandbox does not update balances.
- 📱 Real-phone navigation accuracy is still being tested on real routes.

## 📄 License

[MIT](LICENSE) © 2026 The Breadcrumb team (BigRed 2026).
