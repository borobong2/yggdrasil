# YG-63 Flexible Todo Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses task-by-task agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a todo with only its title and optionally manage independent start/planned, internal target, and external deadline dates.

**Architecture:** Reuse scheduledAt/dueAt, add nullable targetAt and targetAllDay through the shared contract, persistence, REST, MCP and UI. Extend today/upcoming membership and labeled date display without changing calendar scheduling behavior. Reuse createTodo and existing owner-scoped area/epic resolution for title-only quick add.

**Tech Stack:** TypeScript, React/Vite, Hono, Zod, Drizzle/Postgres, MCP SDK, Vitest, existing Playwright-core browser harness.

**Spec:** docs/superpowers/specs/2026-10-26-flexible-todo-dates-design.md. The user approved YG-63 on 2026-10-25 UTC; implementation plan review/execution-method selection is pending.

## Global Constraints

- scheduledAt/targetAt/dueAt are all optional and nullable. Same date, same instant and reversed date order are valid. No date inference or automatic correction/movement.
- Omitted update fields preserve values; null clears only that date and flag. Date-only is Asia/Seoul all-day; ISO offset timestamp is timed. completedAt retains its actual-completion meaning.
- Existing target values default null/false; preserve IDs, notes, dueAt, existing all-day flags and user study data.
- YG-64 owns drag, snooze, undo and undated-drop behavior changes. No new calendar, parent/preparation relation, Notion integration or automatic decomposition.
- New targetAt must survive existing drag/snooze/undo/drop and unrelated saves. Recurrence creates future targets as null; do not infer/copy a target to the next occurrence.
- No production/live-user DB migration, deployment, push or merge is authorized. Use only a dedicated local yggdrasil_yg63 database. Do not read auth files or print credentials.
- No code change before plan review/execution-method selection. At execution, use superpowers:using-git-worktrees and an isolated feat/yg-63-flexible-todo-dates worktree. Preserve current uncommitted YG-56/spec/plan documents; never stash/reset/copy unrelated work wholesale.
- No new dependencies. Commit checkpoints below are only after implementation is authorized and local commits are permitted; otherwise retain verified diffs without committing.

## Review Focus

1. Title-only creation still needs owner-scoped placement: choose default 개인 / 일반 without asking for dates; never resolve another owner's records (Task 1).
2. Existing timed scheduledAt must survive title-only detail edits without becoming date-only or losing its time (Task 3).
3. Older restore/snooze/calendar paths must leave targetAt/targetAllDay intact even though their existing dueAt risk remains (Tasks 1 and 4).
4. Target-only todos enter today/upcoming without being counted as externally overdue; scheduled holds/waiting/backlog exclusions remain compatible (Task 2).
5. Adding a non-optional output property breaks typed fixtures and old browser/API inputs unless defaults and mapping are complete (Tasks 1, 3 and 4).

## File map and shared interfaces

- src/contracts/items.ts: Issue.targetAt: string | null; Issue.targetAllDay: boolean. Todo inherits these. Keep TodoSnapshot unchanged so old restore does not touch targets.
- src/server/schema.ts and next available drizzle migration/meta: target_at timestamptz nullable; target_all_day boolean NOT NULL DEFAULT false. Recheck migration number in the execution worktree; 0020 is currently next in main, and another branch may already use it.
- src/server/todos.ts: todoFields.targetAt uses existing nullable day validator; TodoInput.targetAt?: DateInput; columns includes targetAt/targetAllDay; dateChanges/activity comparison includes targets; export DEFAULT_TODO_AREA = '개인'. Existing createTodo/updateTodo signatures stay stable.
- src/server/work.ts: issue(row) maps both output fields. Existing legacy writes remain compatible and do not clear targets.
- src/server/routes/todos.ts: add authenticated POST /api/todos. Input is existing todo create fields with required title and optional area default DEFAULT_TODO_AREA; epic defaults existing 일반. Return 201 Todo; invalid input 400, missing auth 401. Explicitly authenticate the exact /api/todos path as well as nested paths.
- src/server/mcp-todos.ts: create_todo/create_todos accept title-only items by defaulting omitted area, preserve supplied areas; add target fields to compact output and labeled markdown/resources. update_todo uses shared target validator. Keep dueBefore/dueAfter deadline-only.
- src/client/TodoDetail.tsx: optional date and optional time for all three date roles, independent clearing, lossless timed-date drafts.
- src/client/TodayView.tsx, src/client/PlanningView.tsx, src/client/format.tsx: shared role-labeled date display, and title-only quick add on Today. Retain existing planning creation/placement controls.
- New src/client/TodoDates.tsx: TodoDates({ todo }: { todo: Pick<Issue, 'scheduledAt' | 'scheduledAllDay' | 'targetAt' | 'targetAllDay' | 'dueAt' | 'dueAllDay'> }) renders populated date roles via existing Seoul format helpers. Do not reuse deadline overdue coloring for targets.
- test/yg63-flexible-dates.test.ts, test/yg63-browser-server.ts and test/yg63-browser.mjs: focused service/API/MCP and browser acceptance; extend existing date/calendar/recurrence tests where their fixtures already fit.

## Task 1: Persistence and consistent title/date write contracts

**Files:** contracts/items.ts, server/schema.ts, server/work.ts, server/todos.ts, server/routes/todos.ts, server/mcp-todos.ts under src; next drizzle migration/meta; test/yg63-flexible-dates.test.ts; test/mcp-todos.test.ts; typed fixture sites reported by typecheck.

**Interfaces:** Produces the fields and POST contract from File map. createTodo(ownerId, input: TodoInput, via?) and updateTodo(ownerId, id, changes: TodoChanges, via?) retain their signatures; area stays required for internal TodoInput, defaulted only at public create boundaries.

- [ ] Read spec and required worktree skill, inspect attached/existing worktrees, then create/reuse an isolated YG-63 worktree without disturbing active work. Record base commit and clean/unrelated status. Bring only approved YG-63 planning documents into that worktree if needed. Read product contract and write docs/yg-63-flexible-todo-dates.md from this approved scope before implementation.
- [ ] Set the dedicated local DB URL shown below; create yggdrasil_yg63 only if absent. Do not run tests/migrations if host is not 127.0.0.1 or DB name is not yggdrasil_yg63. Confirm existing runtime dependencies are available; if not, report rather than install without permission.
- [ ] Add failing tests: title-only POST and MCP create/batch return area 개인, epic 일반, all dates null; supplied area survives. Assert 401 unauthenticated exact POST and owner isolation. Add same-day/same-instant/reversed-order date writes and null/omission semantics. Example: update targetAt=null leaves dueAt='2026-10-31T14:59:00.000Z' and scheduledAt unchanged; unrelated title update preserves all three timestamps/flags.
- [ ] Run targeted tests and record expected missing-field/route failures: npx vitest run test/yg63-flexible-dates.test.ts test/mcp-todos.test.ts. Existing migration state must be ready on the disposable DB first; distinguish infrastructure failures from feature failures.
- [ ] Implement shared contract, schema, issue mapping and columns/validation/activity handling; generate the next migration with npx drizzle-kit generate. Add title-only defaults at REST/MCP create boundaries; do not relax title validation. Map targetAt/targetAllDay in compact MCP outputs and labeled resource text, including today/upcoming representations.
- [ ] Seed a legacy todo on the disposable DB before applying the new migration; migrate that DB only and assert same ID/dueAt/scheduledAt/flags with null targetAt and false targetAllDay. Add datetime/date-only/timed-midnight/invalid-date/foreign-owner assertions. Verify explicit null resets target flag false while omission leaves it unchanged.
- [ ] Run targeted tests and npm run typecheck; fix genuine required-field fixtures. Check old legacy routes update unrelated fields without target loss. If local commits are permitted, checkpoint exact Task 1 files as feat(YG-63): add optional target dates and title-only creation.

## Task 2: Today/upcoming membership and MCP meaning

**Files:** src/server/todos.ts, src/server/mcp-todos.ts; test/yg63-flexible-dates.test.ts, test/mcp-todo-resources.test.ts, test/yg34-today-workbench.test.ts.

**Interfaces:** todayView(ownerId: string, now?: Date): Promise<TodayView> keeps its shape. today adds target-day <= today as an OR reason under existing eligibility filters; week matches any of three dates tomorrow through +7 days, excluding today IDs. overdue/late and calendarView retain existing semantics.

- [ ] Add failing frozen-time tests at 2026-10-26T09:00:00+09:00: scheduled today with due 10/31 is in today; target today or past enters today; target tomorrow enters week; all matching dates produce one row; past target is not external overdue. Assert waiting/blocked/future-scheduled hold rules and target-only backlog compatibility. Existing p1 behavior stays unchanged.
- [ ] Run npx vitest run test/yg63-flexible-dates.test.ts test/mcp-todo-resources.test.ts and confirm membership tests fail for the expected missing target inclusion.
- [ ] Extend today/week query ORs only; preserve existing hold/status/backlog/archive/owner filters, stale and due-overdue calculations. Add target labels in MCP markdown, retaining each date's meaning. Do not add calendar placement/timeline membership from targetAt.
- [ ] Run targeted tests plus test/yg34-today-workbench.test.ts and test/calendar.test.ts. Assert a target-only item remains in calendar undated-placement output, and a due+scheduled item keeps deadline-first calendar placement. If permitted, checkpoint Task 2 as feat(YG-63): surface start and target dates in daily lists.

## Task 3: Optional date editing, labeled rows and title-only quick add

**Files:** src/client/TodoDetail.tsx, new src/client/TodoDates.tsx, src/client/TodayView.tsx, src/client/PlanningView.tsx, src/client/format.tsx; new test/yg63-browser-server.ts and test/yg63-browser.mjs based on existing yg48/yg34 fixtures.

**Interfaces:** TodoDates props as File map. Today quick add POSTs {title} to /api/todos, refreshes existing view after success and reports success even when an undated non-p1 item is absent from today's filtered list. Detail PATCH uses date-only when time empty and offset timestamp when time populated, with role-specific null on clearing.

- [ ] Add browser acceptance cases before UI edits: title-only add creates an undated todo; all three optional dates/times can be set equal and independently cleared; a title-only edit of timed scheduledAt preserves the timestamp; row shows 시작/예정, 내부 완료 목표, 실제 마감 together. Include blank-title rejection, failed save retry and quick-add network failure retaining typed title.
- [ ] Run browser harness and record expected missing-control/label failures. Use only the dedicated test DB; harness starts its own test-owner server, never production.
- [ ] Implement shared labeled date rendering in Today rows and planning detail; retain current title requirements, dates optional, no empty badges. Add separate time inputs available without enabling recurrence. Initialize both date and time for existing timed dates. Do not silently convert a populated timestamp during an unrelated edit; do not send another field's null when clearing one date.
- [ ] Implement Today quick add with one required title and default placement from Task 1. On successful date-free creation, show confirmation and clear the field; do not invent today's date or force p1 solely to make it visible. Keep dates editable through the normal detail UI.
- [ ] Run browser acceptance at widths 390, 768 and 1280; no overflow, roles readable, clear controls keyboard accessible. Read created test records back to verify timestamps/nulls, not only visible labels. Run npm run typecheck and npm run build. If permitted, checkpoint Task 3 as feat(YG-63): edit independent dates and quick-add plain todos.

## Task 4: Compatibility verification and independent final review

**Files:** test/yg63-flexible-dates.test.ts, test/yg38-all-day.test.ts, test/calendar.test.ts, test/recurrences.test.ts, test/yg63-browser.mjs; docs/yg-63-flexible-todo-dates.md evidence only.

**Interfaces:** No new scheduling behavior. Existing TodoSnapshot remains its original fields; targetAt/targetAllDay remain untouched by restoring those snapshots. spawnNext creates a new occurrence with null targetAt/false targetAllDay.

- [ ] Add regression assertions that snooze then restore, legacy title/status edits and calendar PATCH/drop clearing dueAt/scheduledAt preserve an existing timed target exactly. Browser drag/undo coverage must assert preservation without changing which existing date the drag chooses. Existing dueAt changes are acknowledged YG-64 behavior, not an invitation to fix them here.
- [ ] Add recurrence test: completing a targeted recurring occurrence preserves its recorded target and produces the next occurrence with no target. Add KST boundary tests separating all-day and timed dueAt and confirming target lateness is not external deadline lateness.
- [ ] Run the full commands below once after targeted checks pass. Record exact results and actual DB guard evidence without secrets. Fix regressions within scope; do not broaden into YG-64. Optional local commit checkpoint after all checks, never push/merge/deploy.
- [ ] Request one independent final diff review only after implementation and tests, if that execution/review method is selected. Address material findings and rerun affected checks; hand over branch/worktree path, changed files, test evidence and remaining YG-64 limitation. Do not claim production availability.

## Local-only verification commands

Run from the implementation worktree. Use the existing localhost development credentials from README, never production credentials. These are future execution commands, not actions taken while writing this plan.

```sh
export DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg63
node --input-type=module -e 'const u=new URL(process.env.DATABASE_URL); if(u.hostname!=="127.0.0.1" || u.pathname!=="/yggdrasil_yg63") throw Error("Dedicated local DB required"); console.log("Dedicated local YG-63 database selected")'
# If absent only, create yggdrasil_yg63 using the existing local Postgres service.
# Do not run db:migrate:local: it targets the live local yggdrasil database.
npm run db:migrate
npx vitest run test/yg63-flexible-dates.test.ts test/mcp-todos.test.ts test/mcp-todo-resources.test.ts test/calendar.test.ts test/recurrences.test.ts test/yg38-all-day.test.ts
npm test
npm run typecheck
npm run build
git diff --check
```

Browser harness contract: NODE_ENV=test npx tsx test/yg63-browser-server.ts starts the existing test-owner setup on a free local test port specified in that harness; node test/yg63-browser.mjs tmp/yg63-screens targets that port, runs the three viewport cases and exits nonzero on any failed assertion. Reuse the existing browser executable discovery; do not install a browser or dependencies without authorization. Stop only the harness server started for this test.

## Self-review and execution recommendation

Coverage checked against the approved spec and latest title-only requirement: nullable fields and migration/defaults (Task 1), explicit clear/omission and REST/MCP parity (Task 1), same/reversed dates (Task 1), today/upcoming and external-overdue distinction (Task 2), independent editing and meaningful labels (Task 3), title-only creation with default placement (Tasks 1/3), existing scheduling/recurrence compatibility (Task 4). All five Review Focus items have owning tests. No production operation or YG-64 behavior change is a task.

Builder choices made explicit: default title-only placement is 개인 / 일반 using existing owner-scoped creation; date-free additions get success feedback rather than an invented date; targets remain outside calendar placement until YG-64. The old spec's placement requirement applies internally, while the approved title-only experience supplies that placement automatically.

Recommend native execution followed by one independent final review: the four tasks depend on one shared date contract, so keeping implementation context is simpler and cheaper than fresh implementer/reviewer contexts for every task. Task-by-task subagents remain an option if the user prefers extra review gates. Await plan review and execution-method selection; do not ask for the already-approved design again.
