# YG-64 Safe calendar scheduling design

Status: implementation requested directly by user on 2026-10-26; PR/push/merge/deploy not authorized for this task.

## Outcome and approach

Calendar drag and tomorrow/next-week snooze move only scheduledAt. Actual dueAt and internal targetAt survive every scheduling action and undo. No migration or bulk data rewrite.

Options: keep due-first display while moving scheduledAt (small but cards appear not to move); use scheduled-first placement with explicit date roles (selected); introduce separate deadline events/planning entities (larger and unnecessary here).

## Contract

- Default effective calendar placement: scheduledAt, else dueAt. Explicit due/scheduled view filters remain available. Target dates never determine calendar placement.
- Drag always writes only scheduledAt regardless of display basis. Due-only/undated cards acquire a new schedule, without inheriting the real deadline's time. Existing timed schedule keeps KST time on a date-only move; an hour slot sets time, all-day target removes time. Same date/instant permitted, no-op skips identical schedule. Esc/outside drop writes nothing.
- In due view, a successful schedule drag switches to effective (예정 우선) so the planned location is visible; failures preserve the view. Undo restores only the previous scheduledAt/all-day meaning, never dueAt/targetAt.
- Rename 날짜 없음 to 작업 예정 없음. Its list is open, unarchived todos with no scheduledAt, even if dueAt/targetAt exist. Drag there removes only scheduledAt. A remaining deadline stays visible in the calendar's fallback position and in the clearly labeled unscheduled list. These two appearances are intentional: deadline visibility plus scheduling affordance. Show actual deadline/target labels on calendar cards. If no scheduledAt already, dropping there is a no-op.
- Keep the wire field `undated` for compatibility, documenting its new unscheduled meaning. Server and optimistic client placement must agree for every basis/range.
- Calendar creation in default/scheduled view sets scheduledAt; explicit due view creation remains explicit deadline creation with a visible actual-deadline label.
- Snooze sets scheduledAt to requested date, preserving existing scheduled time (including seconds/milliseconds) or creating all-day when absent; it never writes dueAt, targetAt, status or hold. Bulk snooze undo snapshots contain only id/scheduledAt. Restore accepts partial snapshots with required id and at least one permitted field, preserving old full snapshots for non-scheduling actions. Triage snooze uses the returned snapshot, not a cached full todo. This protects unrelated explicit deadline edits between snooze and undo.
- While calendar writes/undo are pending, prevent concurrent drags and duplicate undo. On failure reload current view rather than replay stale full objects; preserve navigation generation guards. Undo failure retains a retry action. No global data movement or status changes.

## Scope and verification

Existing mobile tabs, new calendar modes, automatic decomposition, Notion integration, target-date inference and production actions are outside scope. Existing completed-item deadline coloring from YG-63 is unchanged.

Test default/explicit calendar bases and ghosts, due-only and date-free cards, independent dates equal, range-boundary relocation and reload, KST midnight, timed/all-day moves, Escape/outside drop, repeat move/undo, failed move/undo and navigation while pending. Test snooze tomorrow/next-week/default/held todos and field-limited undo preserving later explicit due/target edits. Full tests/typecheck/build and browser 390/768/1280, then one independent read-only final review. Only dedicated local yggdrasil_yg64 DB on 127.0.0.1:54364. Report local result and await PR/merge/deploy authorization.
