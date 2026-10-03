---
name: orchestrator
description: Coordinate Breadcrumb work across Claude, Codex, Cursor and human teammates. Use for every task and continuation in the current multi-agent MVP build.
---

# Project orchestration

This is a project adaptation of the user's installed orchestrator skill, read on 2026-10-03. The user's explicit Claude/Codex model choice replaces that skill's older model table.

Read [the work protocol](../../knowledge/work-protocol.md), then `PROGRESS.md` and the selected stage. The protocol is the canonical home for roles, PR gates, usage limits and context handling.

The lead owns direction and integration. Give each worker one bounded task, disjoint file ownership, acceptance checks and a compact output contract. Workers must preserve concurrent edits. Use one implementer by default and one merger. Keep dependent work sequential. Do small coordination tasks directly when delegation would cost more.

Claude calls the official Codex plugin for implementation with the user's `gpt-6.1-sol` choice. Do not silently replace the model or invoke a different implementation path. Check actual support before dispatch. Inspect artifacts and test evidence before accepting a worker's claim.

Use fresh sessions for new features and short saved handoffs for continuity. Reuse a worker for fixes to the same feature. Avoid idle polling and repeated full-context reads. If assigned as a worker, follow this protocol within the assignment; do not start more agents.

Record evidence, update knowledge and complete the PR cycle. Pause on the protocol's budget/deadline gates. Report an exact blocker when work cannot proceed.
