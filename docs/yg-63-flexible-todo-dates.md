# YG-63 — Flexible todo dates

Design approved; implementation authorized with draft PR, conditional merge and deployment after verification. Use feat/yg-63-flexible-todo-dates isolated worktree.

Spec: docs/superpowers/specs/2026-10-26-flexible-todo-dates-design.md
Plan: docs/superpowers/plans/2026-10-26-flexible-todo-dates.md

Outcome: title-only todo creation (개인 / 일반), independent optional scheduledAt/targetAt/dueAt, equal/reversed dates allowed, per-field clearing and labeled today/upcoming output. completedAt stays actual completion. Nullable target migration and REST/MCP/UI parity are one ticket. Owner isolation/activity provenance unchanged.

No automatic planning, parent relations or quiz edits. YG-64 owns existing calendar drag/snooze deadline preservation behavior; target fields must survive those operations.

Local verification: yggdrasil_yg63 on 127.0.0.1:54363 only. npm test, npm run typecheck, npm run build, git diff --check, browser 390/768/1280. Operational additive migration runs only via existing approved deployment path after merge.

Evidence: pending implementation and review.
