---
name: orchestrator
description: Coordinate Breadcrumb work across Claude, Codex, Cursor and human teammates. Use for every task and continuation in the current multi-agent MVP build.
---

# Project orchestration

This is a project adaptation of the user's installed orchestrator skill, read on 2026-10-03. It overrides the global orchestrator's Sonnet executor/builder defaults. The user's model choices take precedence over older skill defaults. Apply the project [operator skill](../operator/SKILL.md) too.

Read [the work protocol](../../knowledge/work-protocol.md), then `PROGRESS.md` and the selected stage. The protocol is the canonical home for roles, both model routes, foreground dispatch, PR gates, usage limits and context handling.

The lead owns direction and integration. Give each worker one bounded task, disjoint file ownership, acceptance checks and a compact output contract. Workers must preserve concurrent edits. Use one implementer by default and one merger. Keep dependent work sequential. Do small coordination tasks directly when delegation would cost more.

Claude calls the official Codex plugin's native rescue Agent for implementation. Choose the mechanical or substantive model through the protocol; leave effort unset. Do not silently replace the model or invoke a different implementation path. Record actual support. Use foreground completion and the protocol's failed-handoff rule. Inspect artifacts and test evidence before accepting a worker's claim.

Use bounded fresh sessions for new features and short saved handoffs for continuity. Reuse a worker only when the runtime confirms that the session exists; otherwise use the handoff and a fresh worker. Do not poll a live rescue. Avoid repeated full-context reads. If assigned as a worker, follow this protocol within the assignment; do not start more agents.

Record evidence, update knowledge and complete the PR cycle. Pause on the protocol's budget/deadline gates. Report an exact blocker when work cannot proceed.
