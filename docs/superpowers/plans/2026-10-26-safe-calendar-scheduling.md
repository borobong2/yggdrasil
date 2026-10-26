# YG-64 Safe Calendar Scheduling Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for direct implementation with one independent final reviewer. Steps use checkbox syntax.

**Goal:** Schedule work without silently changing actual deadlines or internal targets.
**Architecture:** Reuse scheduledAt and existing calendar/bulk APIs; scheduled-first effective display and field-limited scheduling undo. No persistence schema change.
**Tech Stack:** Existing React/Hono/Drizzle/MCP contracts, Vitest, Playwright-core.
**Spec:** docs/superpowers/specs/2026-10-26-safe-calendar-scheduling-design.md

## Global Constraints

Direct local implementation authorized, no repeated workflow-choice question. No push/PR/merge/deploy/operational migration. Preserve YG-63, mobile navigation, other worktrees, study data and secrets. Existing local dependencies only. Dedicated test DB yggdrasil_yg64 port 54364. Isolated feat/yg-64-safe-calendar-scheduling from 30d6605. No new dependencies.

## Review Focus

1. Scheduled-only undo must not overwrite a deadline/target explicitly edited later (Task 1).
2. Due-only cards can appear as deadline fallbacks and unscheduled entries without duplicate draggable IDs (Task 2).
3. Optimistic removal/reposition must agree with server filters after refresh, including due and scheduled views (Tasks 1/2).
4. Pending/failed undo, repeated gestures and navigation cannot replay stale full todo snapshots (Task 2).
5. Timed midnight/all-day transitions and recurring previews must follow the selected display anchor (Tasks 1/3).

## Task 1: Server scheduling and calendar read contracts

**Files:** src/server/todo-bulk.ts, src/server/todos.ts, src/contracts/items.ts, src/contracts/dates.ts, src/client/TriageDialog.tsx; test/yg64-scheduling.test.ts and existing calendar/bulk/date tests with superseded expectations.
**Interfaces:** CalendarView retains undated field with new unscheduled semantics. TodoSnapshot = required id plus optional existing snapshot fields. Snooze previous snapshot is only id/scheduledAt. Existing restore full snapshots remain valid. Add moveToSeoulDay(instant: string, day: string, allDay: boolean): string for precision-preserving snooze.

- [ ] Read spec/plan and initialize scoped ledger; baseline npm test in independent local container/DB. No live migrations.
- [ ] Write and run RED tests: snooze writes schedule only and preserves exact timed schedule across KST boundary; only scheduling snapshot fields returned; partial restore preserves later explicit deadline/target edit; id-only/foreign/unknown restores rejected; default calendar scheduled-first and no-schedule list includes due/target-only but not scheduled/archived/done/foreign records; selected basis ghosts preserved.
- [ ] Implement shared precision date helper, snooze contract and partial restore validation; retain owner/transaction/activity safeguards. Update TriageDialog to undo snooze using response.previous.
- [ ] Change default effective calendar SQL/ghost anchor to scheduled then due; unscheduled query uses scheduledAt null. Keep selected due/scheduled filters. Update contract comments and only existing tests whose intentional old due-changing behavior is superseded.
- [ ] Run targeted server tests and typecheck, inspect output. Record RED/GREEN and checkpoint local commit.

## Task 2: Consistent calendar interaction and labeling

**Files:** src/client/CalendarView.tsx, src/client/CalendarCreate.tsx; new test/yg64-browser-server.ts and test/yg64-browser.mjs. Use existing date helpers for drag snapping, and formatDue for explicit date labels.
**Interfaces:** fieldOf picks selected due/scheduled or effective scheduled-first; patch accepts only {scheduledAt?: string|null}. Schedule drag success in due basis switches effective; create field is scheduled unless explicitly due. Unscheduled sidebar uses unique draggable idPrefix; place() independently computes calendar and sidebar membership.

- [ ] Write browser acceptance and run RED before UI change: due-only/date-free drag sets schedule, due/target unchanged; scheduled-first placement after reload; clear schedule goes to 작업 예정 없음 while deadline fallback remains and labels disclose its role; explicit due-view drag reveals plan; undo affects schedule only.
- [ ] Implement field-limited drag/clear/undo and precise schedule all-day handling; do not derive working time from deadline. Rename sidebar and add instructions/date-role text; prevent duplicate draggable IDs for due fallback plus sidebar. Preserve creation semantics for explicitly selected due view.
- [ ] Serialize calendar writes using a pending ref/state, disable new drags/undo while pending, keep navigation generation guards, and let failed undo be retried using a fresh current-view reload rather than stale object rollback.
- [ ] Run browser scenarios at 390/768/1280 and inspect screenshots: real pointer scheduling; keyboard Escape; timed/all-day conversion; same-day dates; moving beyond selected range; repeat move+undo; failed move/undo; explicit deadline change before undo; due-view basis transition. Confirm request bodies only scheduledAt on scheduling actions and due/target always preserved. Run typecheck/build, checkpoint local commit.

## Task 3: Final regression and independent review

**Files:** affected existing tests, docs/yg-64-safe-calendar-scheduling.md evidence; no extra feature surface.
**Interfaces:** no database migration and no production state change.

- [ ] Update YG-63 browser compatibility expectation from due-changing drag to schedule-changing drag while preserving its target regression. Add focused precision/recurrence/undo assertions not already pinned.
- [ ] Run DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54364/yggdrasil_yg64 npm test, npm run typecheck, npm run build, git diff --check and both affected browser harnesses against their isolated owner fixtures. No lint script is currently configured; state that rather than claiming lint ran.
- [ ] Package final diff and request one fresh independent read-only reviewer. Fix Important/Critical findings via RED→GREEN and rerun affected/full checks. Record any deferred Minor findings and every ruling.
- [ ] Stop only own test server/container, retain test volume/evidence and isolated worktree. Report branch/commit, diff summary, exact results, known limits and remaining PR/merge/deploy approval. Do not push or publish PR.

## Self-review

All contract changes map to Task 1, display/drag/creation/async behavior to Task 2, full regression/review to Task 3. Partial restores preserve legacy callers; Triage's cached full undo is explicitly replaced for snooze. Default placement fallback plus unscheduled duplication needs unique draggable IDs and independent client placement. No implementation requires migration or new dependencies.
