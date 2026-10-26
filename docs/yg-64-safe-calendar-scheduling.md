# YG-64 — Safe calendar scheduling

Local implementation authorized by user's direct request. PR/push/merge/deploy require further confirmation.
Spec: docs/superpowers/specs/2026-10-26-safe-calendar-scheduling-design.md
Plan: docs/superpowers/plans/2026-10-26-safe-calendar-scheduling.md
Outcome: scheduled-only drag/snooze/clear/undo, real deadline and internal target preservation, scheduled-first default placement, explicit unscheduled sidebar. No migration. Dedicated local DB only.
Evidence: local yggdrasil_yg64 DB at 127.0.0.1:54364; all 219 tests (45 files), typecheck/build/diff checks passed. YG-64 browser real drag/keyboard/undo/retry/KST/timed/all-day/navigation/create/snooze cases passed at 390/768/1280. Existing YG-63 UI regression passed on a separate synthetic owner. No lint script configured.

Independent final review found one Important stale failure-recovery GET/undo-retry race. Reproduced with delayed browser response, fixed by read invalidation and authoritative refresh, regression RED→GREEN and full suite passed afterward. No unresolved findings. No production operations or mobile-tab changes; awaiting publish/merge/deploy authorization.
