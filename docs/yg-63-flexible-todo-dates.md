# YG-63 — Flexible todo dates

Design approved; implementation authorized with draft PR, conditional merge and deployment after verification. Use feat/yg-63-flexible-todo-dates isolated worktree.

Spec: docs/superpowers/specs/2026-10-26-flexible-todo-dates-design.md
Plan: docs/superpowers/plans/2026-10-26-flexible-todo-dates.md

Outcome: title-only todo creation (개인 / 일반), independent optional scheduledAt/targetAt/dueAt, equal/reversed dates allowed, per-field clearing and labeled today/upcoming output. completedAt stays actual completion. Nullable target migration and REST/MCP/UI parity are one ticket. Owner isolation/activity provenance unchanged.

No automatic planning, parent relations or quiz edits. YG-64 owns existing calendar drag/snooze deadline preservation behavior; target fields must survive those operations.

Local verification: yggdrasil_yg63 on 127.0.0.1:54363 only. npm test, npm run typecheck, npm run build, git diff --check, browser 390/768/1280. Operational additive migration runs only via existing approved deployment path after merge.

Evidence before independent review: dedicated local DB 127.0.0.1:54363/yggdrasil_yg63; baseline 206/206, final 214/214 tests (44 files), typecheck/build and diff whitespace checks passed. Browser checks passed at 390/768/1280 for date-free quick add, equal timestamps, title-only edit preservation, independent clearing, failed create/save retry, role labels and no horizontal overflow. Real calendar pointer drag and undo preserve targetAt. Legacy migration ID/date/flags preserved. No lint script exists in package.json. Independent review completed against 0799e14..28ee827: ready to merge, zero critical/important issues. Deferred minor: TodoDates can color a completed planning issue's past deadline red; completion-aware styling is a follow-up. Release pending.
