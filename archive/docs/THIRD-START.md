# Third person: voice and demo evidence

Status: reserved assignment, 2026-10-03. Start only when Jayden assigns Part C to you. [Team contract and ownership](TEAM-HANDOFF.md) is the source of truth. This lane can be tested without the creator or camera work.

Use the prerequisites and environment handling in [friend setup](FRIEND-START.md). Clone the same documentation branch, but create `feat/voice-adapter` instead of `feat/follow-camera`. Run the same baseline checks. You need your own Claude/Codex sign-ins and confirmed provider spending allowance; the shared `.env.local` alone does not prove either. Do not restart the overnight task.

```sh
git clone --branch docs/parallel-team-handoff https://github.com/jayclim/BigRed26.git
cd BigRed26
git switch -c feat/voice-adapter
npm ci
```

## Paste into Claude Code

```text
You are the task lead for Part C (voice and demo evidence) of Breadcrumb. Jayden's Claude is the sole integration owner and merger. Part A owns Teach; Part B owns camera recognition and the guide. Read AGENTS.md, CONTEXT.md, skills/operator/SKILL.md, skills/orchestrator/SKILL.md, docs/TEAM-HANDOFF.md, PROGRESS.md and the relevant build-stage inputs. The new TEAM-HANDOFF supersedes the old staffing plan and stopped overnight queue.

Verify auth, current usage, plugin and model availability. Lead model is claude-opus-5-5. Delegate implementation through the official plugin's native Agent(subagent_type="codex:codex-rescue", run_in_background:false), --fresh --wait, effort unset. Use gpt-6.1-sol for substantive work and independent review; gpt-6-luna only for narrow mechanical work. No model fallback, direct CLI task bypass, duplicate job or live rescue polling. No subteams.

First bounded PR: implement the existing VoiceAdapter contract with an ElevenLabs server adapter, POST /api/speech and browser httpVoice adapter. Follow TEAM-HANDOFF's B↔C interface exactly. Own only src/server/voice/**, src/app/api/speech/**, src/client/voice.ts, scripts/voice-*.mjs and stages/03-build/output/voice.md. Do not edit GuideScreen, core, contracts, app mounts, shared CSS or package files. Another developer owns playback and guide UI. Supply integration instructions; Jayden's Claude wires the adapter later.

Reuse existing Result types, HTTP error mapping, installed packages and native APIs. Inject the provider for offline tests. Forward exact supplied guidance text, cache by text/locale/voice, validate and bound input, handle missing credentials/timeouts/rate limits, deliver audio without exposing keys, and return recoverable errors. Keep code lean. No voice error may change navigation state. Do not make live provider calls until free/included spending caps are confirmed.

Prove the adapter and HTTP/audio delivery independently with fake-provider tests and a standalone browser harness. Distinguish a test clip from real ElevenLabs audio. Record actual commands and evidence. Run baseline check/typecheck/build and affected HTTP checks with temporary data. Commit each verified checkpoint, push and verify the remote SHA, open a PR and get a fresh independent review of its exact head. Do not merge. Use Simplified Technical English; preserve other people's work and all secrets.

After the first PR, coordinate real teaching/follow/unrelated footage and a short honest demo as separate work. No deployment, paid overages, analytics, messaging or glasses integration. End with branch, SHA, PR, changed files, checks, uncertainty and next action.
```
