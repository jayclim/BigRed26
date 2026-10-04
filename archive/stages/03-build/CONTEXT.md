# 03 · Build

## Inputs

| Layer | File | Scope |
|---|---|---|
| Reference | [architecture](../../../knowledge/architecture.md) | Relevant boundaries and invariants |
| Reference | [reuse inventory](../../../knowledge/reuse.md) | Existing code/tools before adding new |
| Reference | [ownership](../../docs/TEAM-HANDOFF.md) | Affected paths |
| Reference | `contracts/`, `package.json`, affected code | Actual signatures, scripts, callers |
| Working | [scope](../01-scope/output/local-mvp-scope.md), [design](../02-design/output/local-mvp-design.md) | Current slice |

## Process

Trace the flow and callers; reuse existing code, then make the smallest complete change. Validate boundaries. Consult official docs for live providers. Run relevant checks. Coordinate shared files with Claude as lead and preserve concurrent edits.

## Outputs

Keep code in normal source locations. Update [implementation.md](output/implementation.md) with the implementation handoff, changed interfaces and remaining checks. Do not copy source here. Update progress and pass results to verification.
