import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Recurrence } from '../contracts/items.js';
import { appendActivity, type Transaction } from './activity.js';
import { issues, recurrences } from './schema.js';

// YG-28 recurring todos. A series is one `recurrences` row; each occurrence is a normal issue with recurrence_id.
// Completing the open occurrence creates the next one in the same transaction (spawnNext), so no cron.
const DAY = 86_400_000;
const KST = 9 * 3_600_000; // ponytail: Asia/Seoul only (no DST); add a timezone column if another zone is ever needed.
const byUtcDay = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const recurrenceInput = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  weekdays: z.array(z.enum(byUtcDay)).min(1, '반복 요일을 1개 이상 선택하세요.').max(7).optional().describe("Weekly only: e.g. ['mon', 'wed']"),
  monthDay: z.number().int('반복 날짜는 1~31의 정수여야 합니다.').min(1, '반복 날짜는 1~31일입니다.').max(31, '반복 날짜는 1~31일입니다.').optional().describe('Monthly only: day 1-31; past month end means the last day'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional().describe("'HH:mm' Asia/Seoul; omit for all-day"),
  paused: z.boolean().optional().describe('Paused series stop creating next occurrences')
}).strict()
  .refine((rule) => (rule.freq === 'weekly') === (rule.weekdays !== undefined), { message: '매주 반복은 요일이 필요합니다.', path: ['weekdays'] })
  .refine((rule) => (rule.freq === 'monthly') === (rule.monthDay !== undefined), { message: '매월 반복은 날짜가 필요합니다.', path: ['monthDay'] })
  .describe('Repeat rule (YG-28). Completing the open occurrence creates the next one. null ends the series.');
export type RecurrenceInput = z.infer<typeof recurrenceInput>;
type Rule = Omit<Recurrence, 'id' | 'paused'>;

/** First rule slot strictly after `after`, as an instant. Slots are Asia/Seoul wall-clock days at `time` (00:00 when unset). */
export function nextSlot(rule: Rule, after: Date): Date {
  const [hours, minutes] = (rule.time ?? '00:00').split(':').map(Number) as [number, number];
  const offset = (hours * 60 + minutes) * 60_000 - KST;
  // `day` is the KST calendar date of `after`, held as UTC midnight so getUTC* read the calendar fields.
  let day = Math.floor((after.getTime() + KST) / DAY) * DAY;
  for (let i = 0; i < 400; i++, day += DAY) {
    const date = new Date(day);
    const lastOfMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    const hit = rule.freq === 'daily' || (rule.freq === 'weekly' ? Boolean(rule.weekdays?.includes(byUtcDay[date.getUTCDay()]!)) : date.getUTCDate() === Math.min(rule.monthDay ?? 0, lastOfMonth));
    if (hit && day + offset > after.getTime()) return new Date(day + offset);
  }
  throw new RangeError('Recurrence rule never matches');
}

/** First slot for a new series: today counts (all-day rules) or now onwards (timed rules). */
export function firstSlot(rule: Rule, now = new Date()): Date {
  return nextSlot(rule, new Date((rule.time ? now.getTime() : Math.floor((now.getTime() + KST) / DAY) * DAY - KST) - 1));
}

export function toRecurrence(row: typeof recurrences.$inferSelect | null): Recurrence | null {
  return row && { id: row.id, freq: row.freq, weekdays: row.weekdays, monthDay: row.monthDay, time: row.time, paused: row.paused };
}

export function ruleOf(input: RecurrenceInput) {
  return { freq: input.freq, weekdays: input.weekdays ?? null, monthDay: input.monthDay ?? null, time: input.time ?? null, paused: input.paused ?? false };
}

/**
 * Creates, replaces or (input null) ends a todo's series and returns the issue columns to write.
 * Only the rule changes: the open occurrence keeps its date (so one-off exceptions survive); a todo without a due date gets the first slot
 * (all-day when the rule has no time, YG-38).
 */
export async function setRecurrence(tx: Transaction, ownerId: string, todo: { recurrence?: Recurrence | null; dueAt: unknown }, input: RecurrenceInput | null) {
  const id = todo.recurrence?.id;
  const mine = (recurrenceId: string) => and(eq(recurrences.id, recurrenceId), eq(recurrences.ownerId, ownerId));
  if (!input) {
    if (id) await tx.delete(recurrences).where(mine(id)); // FK sets recurrence_id null on every occurrence.
    return { recurrenceId: null };
  }
  const rule = ruleOf(input);
  if (id) await tx.update(recurrences).set({ ...rule, updatedAt: new Date() }).where(mine(id));
  const recurrenceId = id ?? (await tx.insert(recurrences).values({ ...rule, id: crypto.randomUUID(), ownerId }).returning({ id: recurrences.id }))[0]!.id;
  return todo.dueAt ? { recurrenceId } : { recurrenceId, dueAt: firstSlot(rule), dueAllDay: !rule.time };
}

/**
 * Call inside the transaction that just marked `done` complete. Creates the series' next occurrence at the first slot after
 * max(completedAt, this occurrence's date), so missed slots are skipped — and a backdated completion (YG-37) resumes right after
 * the day it was really done instead of after now. completedAt falls back to now for callers that pass a pre-update row.
 * No-op for non-recurring, paused or ended series, or when an occurrence is already open — which makes double completes and
 * retries create nothing extra.
 */
export async function spawnNext(tx: Transaction, done: typeof issues.$inferSelect, payload: Record<string, unknown>, now = new Date()): Promise<void> {
  if (!done.recurrenceId) return;
  // Row lock serializes concurrent completions of the same series.
  const rule = (await tx.select().from(recurrences).where(and(eq(recurrences.id, done.recurrenceId), eq(recurrences.ownerId, done.ownerId))).for('update'))[0];
  if (!rule || rule.paused) return;
  const open = await tx.select({ id: issues.id }).from(issues).where(and(eq(issues.recurrenceId, rule.id), ne(issues.status, 'done'), ne(issues.id, done.id))).limit(1);
  if (open.length) return;
  const anchor = done.dueAt ?? done.scheduledAt;
  const completed = done.completedAt ?? now;
  const slot = nextSlot(rule, anchor && anchor > completed ? anchor : completed);
  const allDay = !rule.time;
  const [{ next }] = (await tx.execute<{ next: number }>(sql`SELECT coalesce(max(position), -1)::int + 1 AS next FROM issues WHERE owner_id = ${done.ownerId} AND status = 'todo'`)).rows as [{ next: number }];
  const id = crypto.randomUUID();
  await tx.insert(issues).values({
    id, ownerId: done.ownerId, epicId: done.epicId, recurrenceId: rule.id, title: done.title, status: 'todo', position: next, priority: done.priority,
    notes: done.notes, estimateMinutes: done.estimateMinutes, source: done.source, dueAt: done.dueAt || !done.scheduledAt ? slot : null, dueAllDay: (done.dueAt || !done.scheduledAt) ? allDay : false,
    scheduledAt: done.scheduledAt ? slot : null, scheduledAllDay: done.scheduledAt ? allDay : false, hold: done.hold === 'scheduled' ? 'scheduled' : null
  });
  await appendActivity(tx, done.ownerId, { kind: 'issue.created', subjectType: 'issue', subjectId: id, payload: { ...payload, recurrenceId: rule.id, previousId: done.id } });
}
