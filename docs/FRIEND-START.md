# Friend setup and first prompt

Read [the current team assignment](TEAM-HANDOFF.md). Voice provider work is reserved for a possible third person; you own the guide-side optional VoiceAdapter consumer, not the voice server. You own Part B: Follow a route. Jayden owns Part A: Teach a route and final integration. The current guide is a mock; live frame recognition is your assigned work, not completed features.

## Setup

Use Node 24 LTS, Git, npm and GitHub access to `jayclim/BigRed26`. Ask Jayden for repository collaborator access if pushes fail; do not send account passwords or tokens. The docs branch below contains this handoff and no app changes. After its PR merges, new feature branches should start from current main.

```sh
git clone --branch docs/parallel-team-handoff https://github.com/jayclim/BigRed26.git
cd BigRed26
git switch -c feat/follow-camera
npm ci
```

Put the privately supplied `.env.local` in this repo root. Do not commit or print it. Verify Git ignores it:

```sh
git check-ignore .env.local
npm run check
npm run typecheck
npm run build
node scripts/smoke-api.mjs
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open `http://localhost:3000`. The fixtures start as drafts. Review and approve a fixture in the creator UI before following it. The smoke test uses its own temporary store. A build may need network access to retrieve the configured font; report a failure instead of silently replacing the font.

For AI work, sign into your own Claude Code and Codex installations. Install/enable OpenAI's official **Codex plugin for Claude Code** and verify that native `codex:codex-rescue` is available. The plugin is separate from this Git repository. Do not assume Jayden's global tools or macOS paths exist on your machine. This project already includes canonical skills in `skills/`, with `.claude/skills/` and `.agents/skills/` discovery links. If your checkout does not preserve symlinks, read the canonical files directly.

Verify Claude Opus 5.5 and the requested Codex worker models are available. If unavailable, report it; do not silently substitute. Verify current usage before a model run. Do not enable paid API authentication or overages. API keys alone are not permission for paid provider calls. The old overnight guard has a fixed deadline and a local STOP: do not remove or bypass them to start work. Agree a new bounded attended run with the integration lead if using that guard. The prompt below is a work assignment, not a new recurring task.

## Paste into Claude Code

```text
You are the task lead for Part B (Follow a route) of Breadcrumb. Jayden's Claude session is the integration owner and sole merger. You may plan and supervise only Part B. Do not merge PRs.

Read AGENTS.md, CONTEXT.md, skills/operator/SKILL.md, skills/orchestrator/SKILL.md, docs/TEAM-HANDOFF.md, PROGRESS.md and the build-stage CONTEXT. Treat TEAM-HANDOFF as the current team assignment; it replaces the older three-person split and stopped overnight queue. Part C is reserved; do not edit its voice-server, speech-endpoint or browser-adapter files. Later, add an optional VoiceAdapter prop to GuideScreen and test it with a fake adapter; the integration owner wires the real one. Read the frozen contracts and listed implementation seams before editing. Read installed Next.js docs for affected APIs.

Use Opus 5.5 (claude-opus-5-5) as lead. Delegate implementation through the official Codex plugin only: native Agent(subagent_type="codex:codex-rescue", run_in_background:false), with --fresh --wait --model gpt-6.1-sol for substantive work/review, or gpt-6-luna for narrow mechanical work. Leave effort unset. Wait for native handback; do not poll live rescue, substitute models or launch duplicate jobs. Workers do not spawn more agents. Check tool availability, auth and current usage first; report missing prerequisites.

Start with one bounded PR: camera/frame capture and guide lifecycle, tested with approved fixtures and injected recognition. Preserve existing mock flows. Inspect current behavior before choosing the smallest implementation. Do not start live provider calls or voice work in this first PR. Follow the Part B ownership table. Other people are working in the repo; do not revert their edits. Shared contracts, core, global CSS, package files and PROGRESS.md belong to the integration owner. Put any needed shared change in the handoff for that owner.

Use existing CoreAdapter and Recognizer. The core decides progress, directions and arrival; provider output is observation evidence only. Honor approved route versions, centrally reserved sequences, one match in flight, stale-response rejection and explicit manual completion. No arrows for uncertainty or unconfirmed approach. No timer-driven progress or arrival. Keep mock/replay/live visibly distinct.

Reuse current components, native APIs and installed packages. Keep the design consistent, code lean and modules focused. Use Simplified Technical English. Keep secrets server-side and outside commits, logs and screenshots. No deployment, overages, purchases or messaging. Use fixture tests until provider spending caps are confirmed.

Run the assignment's independent checks and phone/desktop UI checks. Record actual results and limitations in stages/03-build/output/follow-route.md. Commit each verified checkpoint, push it, and verify local/remote SHA equality. Open a PR to main with exact test commands and any integration wiring needed. Obtain a fresh independent Codex review of the exact head; do not merge. End with branch, commit, PR, checks, known gaps and next action.
```
