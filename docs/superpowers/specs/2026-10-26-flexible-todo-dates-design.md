# Flexible todo dates

Status: design draft for user review; implementation is not approved. 2026-10-26.

## Outcome and selected approach

A plain todo can be created without dates. Optional dates distinguish when to start/work, an internal completion target, and the real external deadline. The user chose date flexibility; calendar drag scheduling is a separate ticket. Ticket creation and updates are handled elsewhere.

Approaches considered:

- Minimum: reuse scheduledAt/dueAt and keep the internal target in notes. No migration, but the target cannot be reliably queried or displayed.
- Selected recommendation: reuse scheduledAt/dueAt and add nullable targetAt. Small persistence/API/UI change with three explicit meanings.
- Later: native parent/preparation-action relationships. Better grouping and progress tracking, but requires relationship and completion rules. Not part of this change.

## Date contract and preservation

- scheduledAt: optional start/planned work date, not an enforced availability gate or a duration interval.
- targetAt: optional internal completion target; distinct from actual completion.
- dueAt: optional real deadline. Existing values retain their meaning and value.
- completedAt remains the actual completion record with existing validation; it is not a planned date.
- All three planned dates may be absent, supplied independently, or equal, including the same instant. No date is inferred from another date.
- On create, omitted/null dates mean no date. On update, omitted fields preserve stored values; explicit null clears only that field and its all-day flag.
- Extend the existing convention with targetAllDay: YYYY-MM-DD means the full Asia/Seoul day; an ISO timestamp with offset means a timed instant. Store timestamptz plus the all-day flag as today. Null clears the flag to false.
- Existing todos receive targetAt = null and targetAllDay = false. Do not backfill target dates, rewrite dueAt, or auto-correct existing date order.
- Proposed compatibility policy for reversed order: accept independently valid dates without a new cross-field rejection or automatic correction. Equal dates are valid. This is a proposal for approval, not a previously agreed business rule.

Example: travel-insurance assignment has scheduledAt 2026-10-26, targetAt 2026-10-27 and dueAt 2026-10-31T23:59:00+09:00. A named preparation action such as reviewing requirements can remain a separate existing todo linked in notes. Driving lessons can use separate provider-research and contact actions. No automatic decomposition or parent relation is introduced.

## UI and read behavior

Retain existing title and area/epic requirements and existing creation flows; do not require dates or add unnamed-item behavior. Keep date controls optional and clearable. Use the labels 시작/예정, 내부 완료 목표 and 실제 마감, with optional time controls consistent with the date contract. Show populated dates with their meaning instead of the current due-first single badge. Missing dates do not render empty badges; wholly undated items keep current list/날짜 없음 conventions.

Extend today/upcoming membership to recognize targetAt as well as scheduledAt/dueAt. Preserve existing owner/archive/status/hold/backlog rules and p1 inclusion. In particular, waiting/blocked items remain in waiting, and future scheduled holds are not activated early by a target. Internal target arrival must not become an external overdue deadline.

- Today: add targetAt on/before the Seoul day as another inclusion reason under the existing eligibility rules. Target-only backlog items follow the current scheduled-only backlog behavior. Keep one entry per todo.
- Upcoming: next seven days may match any of the three dates, excluding items already in today. Keep one entry per todo.
- Late/external-overdue semantics remain based on dueAt and existing stale rules. Display a missed target explicitly as an internal target, not a missed submission deadline.
- Preserve existing calendar placement and timeline membership (dueAt, else scheduledAt) in this scope. A target-only todo remains in the calendar's existing undated-placement list; label that list clearly as lacking a calendar placement date if needed. This is an intentional compatibility limit: targetAt appears in today/upcoming/detail, not as a new calendar event.

## Implementation surface and verification plan

Extend src/contracts/items.ts, src/server/schema.ts, date mapping in src/server/work.ts, shared validation/columns/query logic in src/server/todos.ts, REST and MCP contracts, and relevant detail/today/list formatting. Add one migration for nullable target_at and non-null target_all_day default false. No migration execution is authorized by this design draft.

REST/MCP create/read/update/list must carry targetAt and targetAllDay consistently. Reuse shared todo validation; retain old clients that omit targetAt. Extend MCP todo resources with clearly labeled target dates. MCP date updates stay explicit user-requested writes with existing owner isolation/activity logging. No scheduling tool or automatic write is added. list_todos existing dueBefore/dueAfter filters retain their deadline meaning; no new filter family is required.

Important acceptance cases (run only during approved implementation, against a dedicated test DB):

1. Date-free create through current UI/API/MCP; one-date, partial-date and three-date round trips; legacy records unchanged.
2. Same day and same instant accepted; proposed reversed-order compatibility; invalid dates/offsets rejected.
3. Omitted update preserves; individual null clears only that field/flag; populated-to-empty form save preserves other dates and notes.
4. Date-only versus timed, timed midnight, KST day boundaries, all-day deadline becoming overdue only after its day, and target lateness never becoming external overdue.
5. Today/upcoming inclusion for each date, deduplication, existing hold/backlog/done/archive/p1 rules, and target-only calendar compatibility.
6. Existing calendar drag/undo/drop, snooze, and recurrence do not accidentally delete, shift, copy, or auto-generate targetAt. Next recurrence targets default null unless a later approved policy says otherwise. Existing occurrence targets are preserved by unrelated edits.
7. REST/MCP validation parity, owner isolation, activity provenance, and stale client compatibility. Run repository typecheck/build and targeted/full required tests during implementation, not during this documentation task.

## Separate scope and known risk

No new calendar, drag/undo/undated-drop semantics, tomorrow/next-week rescheduling changes, automatic scheduling/decomposition, native preparation relationship, or Notion integration. Do not modify quiz sources or study progress.

Known existing behavior: snooze normally replaces dueAt unless hold is scheduled; calendar drag chooses dueAt first; dropping to undated clears dueAt and scheduledAt. Those behaviors can change/remove real deadlines today. This date-field change does not claim to fix that risk. A separate rescheduling ticket should preserve real deadlines and define which date is moved or cleared; this draft neither approves nor implements it. Compatibility here requires those older operations to leave targetAt intact and never move all dates together.

## Approval points

The selected nullable-target approach and optional/equal dates reflect the user's direction. Approve this draft before writing an implementation plan or product code. Proposed details to confirm together: permit reversed date order without correction, target-only today/upcoming inclusion with current backlog/hold rules, and retain deadline-first calendar placement until the separate rescheduling scope is designed.
