import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { BulkResult, Todo, TodoSnapshot, TodoVia } from '../contracts/items.js';
import { appendActivity } from './activity.js';
import { getDb } from './db.js';
import { issues } from './schema.js';
import { spawnNext } from './recurrences.js';
import { columns, nextPosition, parseTodoDate, todoFields, todoRows, type TodoChanges } from './todos.js';
import { NotFoundError } from './work.js';

// YG-26 bulk triage. One transaction: every id must be the caller's or nothing is written.
const ids = z.array(z.uuid()).min(1).max(200).refine((list) => new Set(list).size === list.length, 'Duplicate ids');
const instant = z.iso.datetime({ offset: true }).nullable();
export const bulkInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete'), ids }).strict(),
  z.object({ action: z.literal('backlog'), ids }).strict(),
  // Sets the due date; todos on a 예정 hold shift their scheduled date instead.
  z.object({ action: z.literal('snooze'), ids, until: z.iso.date() }).strict(),
  z.object({ action: z.literal('hold'), ids, hold: z.enum(['waiting', 'blocked']), holdReason: todoFields.holdReason.optional() }).strict(),
  // Undo: the `previous` snapshots returned by the last bulk call.
  z.object({ action: z.literal('restore'), items: z.array(z.object({ id: z.uuid(), status: todoFields.status, dueAt: instant, scheduledAt: instant, hold: todoFields.hold, holdReason: todoFields.holdReason }).strict()).min(1).max(200)
    .refine((list) => new Set(list.map((item) => item.id)).size === list.length, 'Duplicate ids') }).strict()
]);
export type BulkInput = z.infer<typeof bulkInput>;

export async function bulkUpdateTodos(ownerId: string, input: BulkInput, via: TodoVia = 'ui'): Promise<BulkResult> {
  const targets = input.action === 'restore' ? input.items.map((item) => item.id) : input.ids;
  return getDb().transaction(async (tx) => {
    const scope = and(eq(issues.ownerId, ownerId), inArray(issues.id, targets))!;
    const rows = await todoRows(scope, tx, true);
    if (rows.length !== targets.length) throw new NotFoundError();
    const skipped: string[] = [];
    for (const row of rows) {
      const wanted = changesFor(input, row);
      // ponytail: undo never reopens a completed recurring occurrence whose next one already exists (keeps one open per series); it is skipped and reported.
      if (wanted.status && wanted.status !== 'done' && row.status === 'done' && row.recurrence && await openSibling(row.recurrence.id, row.id)) { skipped.push(row.id); continue; }
      const changed = (Object.keys(wanted) as (keyof TodoChanges)[]).filter((key) => normal(wanted[key]) !== normal(row[key as keyof Todo]));
      if (!changed.length) continue;
      const set = columns(Object.fromEntries(changed.map((key) => [key, wanted[key]])));
      if (set.status) set.position = await nextPosition(tx, ownerId, set.status, set.status === 'done');
      const [updated] = await tx.update(issues).set({ ...set, updatedAt: new Date() }).where(and(eq(issues.id, row.id), eq(issues.ownerId, ownerId))).returning();
      await appendActivity(tx, ownerId, { kind: set.status === 'done' ? 'issue.completed' : 'issue.updated', subjectType: 'issue', subjectId: row.id, payload: { via, changes: changed, bulk: input.action } });
      if (set.status === 'done') await spawnNext(tx, updated!, { via, bulk: input.action }); // YG-28: next occurrence of a recurring todo
    }
    const previous: TodoSnapshot[] = rows.filter((row) => !skipped.includes(row.id)).map(({ id, status, dueAt, scheduledAt, hold, holdReason }) => ({ id, status, dueAt, scheduledAt, hold, holdReason }));
    return { todos: await todoRows(scope, tx), previous, skipped };

    async function openSibling(recurrenceId: string, id: string) {
      return (await tx.select({ id: issues.id }).from(issues).where(and(eq(issues.ownerId, ownerId), eq(issues.recurrenceId, recurrenceId), ne(issues.status, 'done'), ne(issues.id, id))).limit(1)).length > 0;
    }
  });
}

function changesFor(input: BulkInput, todo: Todo): TodoChanges {
  switch (input.action) {
    case 'complete': return { status: 'done' };
    case 'backlog': return { status: 'backlog' };
    case 'snooze': return todo.hold === 'scheduled' ? { scheduledAt: input.until } : { dueAt: input.until };
    case 'hold': return { hold: input.hold, holdReason: input.holdReason ?? null };
    case 'restore': { const { id: _, ...item } = input.items.find((entry) => entry.id === todo.id)!; return item; }
  }
}

// Compares dates by instant so '2026-10-20' equals the stored 2026-10-19T15:00Z.
function normal(value: unknown): unknown {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? parseTodoDate(value)!.getTime() : value ?? null;
}
