# Sources and adaptations

Reviewed 2026-10-03.

| Source | Use | Limits |
|---|---|---|
| User requests in this chat | Claude-led local MVP, two teammates, knowledge brain, local skills, beautiful design | User can revise preferences |
| `breadcrumb-kit/` | Original scope, contracts, team split, fixture | Planning and synthetic data, not implementation evidence |
| [Van Clief & McDermott, ICM v2](https://arxiv.org/html/2603.16021v2), §§3.1–3.4 | Layered context, stages, inspectable handoffs | Does not establish this app's reliability |
| [Jake Van Clief's repository](https://github.com/RinDig/Interpretable-Context-Methodology) and [conventions](https://github.com/RinDig/Interpretable-Context-Methodology/blob/main/_core/CONVENTIONS.md) | Stage contracts, selected inputs, canonical references, skills | Author sources, not a third-party compliance framework |
| [Claude skills](https://code.claude.com/docs/en/skills) and [memory](https://code.claude.com/docs/en/memory) | Skill symlinks and `@AGENTS.md` | Discovery varies by client version |
| [OpenAI skills](https://developers.openai.com/codex/skills) | `.agents/skills/` discovery and symlinks | Restart if new skills are not visible |

## Our adaptation

`AGENTS.md` is shared identity; `CLAUDE.md` imports it. `knowledge/` holds enduring references; four numbered stages cover scope, design, build and verification. Code remains in `src/`, with handoff receipts in outputs. Canonical skills live in `skills/` and local discovery symlinks expose them to both tools. This adapts the method to one app; it is not an exact upstream template installation.

Completion requires evidence and explicit status, not a nonempty output folder. The structure organizes development; runtime recognition and concurrency still require application logic. No upstream orchestration runtime or third-party skills were installed.
