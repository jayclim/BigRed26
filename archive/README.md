# Archive

Build-process notes from the BigRed 2026 hackathon: multi-agent workflow, stage receipts and verification evidence. Kept for reference; not needed to run the app.

| Path | Contents |
|---|---|
| `PROGRESS.md`, `CONTEXT.md` | Final work log and task routing from the build |
| `stages/` | Scope, design, build and verification notes, one folder per stage |
| `docs/` | Handoff and start guides for the team and the overnight run |
| `knowledge/` | Work protocol, working method and source list |
| `skills/` | Agent skills used during the build (operator, orchestrator, knowledge, design, verify) |
| `scripts/` | The overnight-run guard (`claude-run.mjs`) and its check |
| `breadcrumb-kit/`, `Breadcrumb_Hackathon_Kit.zip` | The original hackathon handoff kit, unchanged |

Notes:

- Relative links inside these files can point to their old locations at the repository root. The files are historical records, not maintained documentation.
- The architecture diagram generated during the build (`docs/architecture/breadcrumb.html`) and the vendored Archify skill were removed from the tree. Archify is an MIT-licensed third-party tool: <https://github.com/tt-a1i/archify> (version 3.0.1, commit `d5a1333`). Reinstall it from there to regenerate the diagram.
