import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { CalendarDateBasis, CalendarGhost, CalendarView, Hold, IssueLink, IssueStatus, LateTodo, Priority, StaleView, TodayView, Todo, TodoVia } from '../contracts/items.js';
import { STALE_OVERDUE_DAYS, STALE_UNTOUCHED_DAYS, lateBucket } from '../contracts/stale.js';
import { formatDay, seoulDay } from '../contracts/dates.js';
import { recurrenceLabel } from '../contracts/recurrence.js';
import { appendActivity, type Transaction } from './activity.js';
import { getDb } from './db.js';
import { epics, goals, issues, recurrences } from './schema.js';
import { nextSlot, recurrenceInput, ruleOf, setRecurrence, spawnNext, toRecurrence, type RecurrenceInput } from './recurrences.js';
import { NotFoundError, issue } from './work.js';
import { allocateKeys } from './ticket-keys.js';
import { editLinks, issueLinks } from './links.js';

const db = getDb();
export const DEFAULT_EPIC = '일반';
export class TodoValidationError extends Error {}

// Shared input validation for every todo write surface (MCP tools, HTTP routes).
export const todoName = z.string().trim().min(1).max(200);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const day = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).describe("'YYYY-MM-DD' (Asia/Seoul, all-day) or ISO timestamp with offset (timed)");
/** YG-37: when it was done. Up to 5 minutes ahead is tolerated for clock skew. */
export const completedAtInput = day.refine((value) => dateOnly.test(value) ? value <= seoulDay(new Date()) : Date.parse(value) <= Date.now() + 5 * 60_000, 'completedAt cannot be in the future')
  .describe("When it was done: 'YYYY-MM-DD' (Asia/Seoul; stored as noon that day, or now if earlier) or ISO timestamp. Defaults to now; future values are rejected.");
export const todoFields = {
  epic: todoName.describe("Group inside the area; defaults to '일반'"),
  title: todoName,
  status: z.enum(['backlog', 'todo', 'doing', 'done']),
  priority: z.enum(['p1', 'p2', 'p3', 'p4']),
  dueAt: day.nullable(),
  hold: z.enum(['waiting', 'blocked', 'scheduled']).nullable(),
  holdReason: z.string().trim().max(500).nullable(),
  scheduledAt: day.nullable(),
  notes: z.string().max(20_000),
  estimateMinutes: z.number().int().positive().max(100_000).nullable(),
  actualMinutes: z.number().int().positive().max(100_000).nullable().describe('YG-43: minutes it really took'),
  recurrence: recurrenceInput.nullable(),
  links: issueLinks
};
export const keyPrefix = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{0,9}$/).describe("Ticket key prefix, e.g. 'YG' → next key YG-<n>. On update, only assigns a key when the todo has none.");
export const todoChanges = z.object({ area: todoName, ...todoFields, completedAt: completedAtInput, prefix: keyPrefix }).partial().strict().refine((input) => Object.keys(input).length > 0, 'No changes');

/** Date-only strings ('YYYY-MM-DD') are all-day: stored at 00:00 Asia/Seoul with the *AllDay flag. Anything else is a timed instant. */
export type DateInput = Date | string | null;
export type TodoInput = {
  area: string; epic?: string; title: string; status?: IssueStatus; priority?: Priority; dueAt?: DateInput;
  hold?: Hold | null; holdReason?: string | null; scheduledAt?: DateInput; notes?: string; estimateMinutes?: number | null; actualMinutes?: number | null; source?: string | null;
  /**
   * Ticket key prefix (e.g. 'YG'): assigns the next key on create, or on update when the todo has none.
   * YG-36: on create, omitted means the epic's default prefix (if any); null opts out of a key.
   */
  prefix?: string | null;
  /** YG-28 repeat rule; null ends the series. */
  recurrence?: RecurrenceInput | null;
  /** YG-42: `links` replaces the list; addLinks/removeLinks (update only) edit it in place. */
  links?: IssueLink[]; addLinks?: IssueLink[]; removeLinks?: string[];
};
/** `area` alone moves the todo to that area's default Epic; `epic` alone moves it within its current area. `completedAt` only applies to a done todo. */
export type TodoChanges = Partial<TodoInput> & { completedAt?: Date | string };

const fields = ['title', 'status', 'priority', 'hold', 'holdReason', 'notes', 'estimateMinutes', 'actualMinutes', 'source', 'links'] as const;

export function parseTodoDate(value: DateInput): Date | null {
  if (value === null || value instanceof Date) return value;
  const date = new Date(dateOnly.test(value) ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${value}`);
  return date;
}

/**
 * YG-37. A date-only completion means "sometime that day": noon Asia/Seoul keeps it inside that day for any reader's timezone
 * and away from midnight edges, and is clamped to now so "today" is never stored in the future (23:59:59 would be).
 */
export function parseCompletedAt(value: Date | string, now = new Date()): Date {
  if (typeof value === 'string' && dateOnly.test(value)) { const noon = new Date(`${value}T12:00:00+09:00`); return noon > now ? now : noon; }
  return parseTodoDate(value)!;
}

export const seoulDate = seoulDay;

/** YG-40: one transaction for the whole list — areas/epics, keys and positions are resolved in a few batched queries, then one multi-row insert. */
export async function createTodos(ownerId: string, inputs: TodoInput[], via: TodoVia = 'ui'): Promise<Todo[]> {
  if (!inputs.length) return [];
  return db.transaction(async (tx) => {
    const places = await resolveEpics(tx, ownerId, inputs.map((input) => [input.area, input.epic ?? DEFAULT_EPIC]));
    const rows: (typeof issues.$inferInsert & { status: IssueStatus })[] = [];
    for (const [i, input] of inputs.entries()) {
      const values = { ...columns(input), id: crypto.randomUUID(), ownerId, epicId: places[i]!.epicId, title: input.title.trim(), status: input.status ?? 'todo' };
      if (input.recurrence) Object.assign(values, await setRecurrence(tx, ownerId, { dueAt: values.dueAt }, input.recurrence));
      rows.push(values);
    }
    const positions = await nextPositions(tx, ownerId, rows.map((row) => row.status));
    rows.forEach((row, i) => Object.assign(row, { position: positions[i] }));
    // Keys last: the counter row lock is held until commit, so keep what follows it short.
    const prefixes = inputs.map((input, i) => [input.prefix === null ? undefined : (input.prefix ?? places[i]!.keyPrefix ?? undefined)?.trim().toUpperCase(), i] as const);
    for (const [prefix, indexes] of grouped(prefixes)) {
      const keys = await allocateKeys(tx, ownerId, prefix, indexes.length);
      indexes.forEach((index, n) => Object.assign(rows[index]!, { key: keys[n] }));
    }
    const inserted = new Map((await tx.insert(issues).values(rows).returning()).map((row) => [row.id, row]));
    await appendActivity(tx, ownerId, ...rows.map((row, i) => ({ kind: 'issue.created' as const, subjectType: 'issue' as const, subjectId: row.id, payload: { via, area: places[i]!.area, epic: places[i]!.epic } })));
    return rows.map((row, i) => {
      const saved = inserted.get(row.id)!;
      const rule = inputs[i]!.recurrence;
      return { ...issue(saved), area: places[i]!.area, epic: places[i]!.epic, recurrence: rule && saved.recurrenceId ? { id: saved.recurrenceId, ...ruleOf(rule) } : null };
    });
  });
}

export async function createTodo(ownerId: string, input: TodoInput, via: TodoVia = 'ui'): Promise<Todo> {
  return (await createTodos(ownerId, [input], via))[0]!;
}

export async function updateTodo(ownerId: string, id: string, changes: TodoChanges, via: TodoVia = 'ui'): Promise<Todo> {
  return db.transaction(async (tx) => {
    const current = (await todoRows(and(eq(issues.id, id), eq(issues.ownerId, ownerId))!, tx, true))[0];
    if (!current) throw new NotFoundError();
    const changed = Object.keys(changes).filter((key) => changes[key as keyof TodoChanges] !== undefined);
    if (!changed.length) return current;
    if (changes.completedAt !== undefined && (changes.status ?? current.status) !== 'done') throw new TodoValidationError('completedAt needs a done todo');
    const place = changes.area === undefined && changes.epic === undefined
      ? { epicId: current.epicId, area: current.area, epic: current.epic }
      : (await resolveEpics(tx, ownerId, [[changes.area ?? current.area, changes.epic ?? (changes.area === undefined ? current.epic : DEFAULT_EPIC)]]))[0]!;
    let set = columns(changes);
    if (changes.recurrence !== undefined) set = { ...await setRecurrence(tx, ownerId, current, changes.recurrence), ...set };
    if (changes.addLinks || changes.removeLinks) set.links = editLinks(set.links ?? current.links, changes.addLinks, changes.removeLinks);
    if (changes.prefix && !current.key) set.key = (await allocateKeys(tx, ownerId, changes.prefix, 1))[0];
    if (set.status && set.status !== current.status) set.position = (await nextPositions(tx, ownerId, [set.status], set.status === 'done'))[0];
    // One clock: stamp completion with the app's now (as updatedAt and spawnNext do) instead of the trigger's DB now().
    if (set.status === 'done' && current.status !== 'done') set.completedAt ??= new Date();
    const [row] = await tx.update(issues).set({ ...set, epicId: place.epicId, updatedAt: new Date() }).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).returning();
    const kind = set.status === 'done' && current.status !== 'done' ? 'issue.completed' : 'issue.updated';
    const rule = changes.recurrence;
    const recurrence = rule === undefined ? current.recurrence ?? null : rule && { id: row!.recurrenceId!, ...ruleOf(rule) };
    const updated = { ...issue(row!), area: place.area, epic: place.epic, recurrence };
    await appendActivity(tx, ownerId, { kind, subjectType: 'issue', subjectId: id, payload: { via, changes: changed, diff: todoDiff(current, updated, changed) } });
    // Completing rolls the series; an active rule set on a done occurrence (resume / late attach) rolls it once too.
    if (kind === 'issue.completed' || (changes.recurrence && !changes.recurrence.paused && row!.status === 'done')) await spawnNext(tx, row!, { via });
    return updated;
  });
}

/**
 * YG-44 activity `diff`: { field: [old, new] } for the fields that really changed, as short display values
 * (dates in Asia/Seoul, recurrence and links as labels, long text cut to 120 characters). Added next to the `changes` name list.
 */
export function todoDiff(before: Partial<Todo>, after: Partial<Todo>, keys: string[]): Record<string, [unknown, unknown]> {
  const field = (key: string) => key === 'prefix' ? 'key' : key === 'addLinks' || key === 'removeLinks' ? 'links' : key;
  const shown = (todo: Partial<Todo>, key: string): unknown => {
    const value = todo[key as keyof Todo];
    if (value === null || value === undefined) return null;
    if (key === 'dueAt' || key === 'scheduledAt') return formatDay(value as string, Boolean(key === 'dueAt' ? todo.dueAllDay : todo.scheduledAllDay));
    if (key === 'completedAt') return formatDay(value as string, false);
    if (key === 'recurrence') return recurrenceLabel(value as NonNullable<Todo['recurrence']>);
    if (key === 'links') return (value as IssueLink[]).map((link) => link.label).join(', ');
    return typeof value === 'string' && value.length > 120 ? `${value.slice(0, 120)}…` : value;
  };
  const out: Record<string, [unknown, unknown]> = {};
  for (const key of new Set(keys.map(field))) {
    const pair: [unknown, unknown] = [shown(before, key), shown(after, key)];
    if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1])) out[key] = pair;
  }
  return out;
}

/** YG-36 「티켓으로 승격」: gives a keyless todo the next key from `prefix`, else its epic's default. Keys are permanent: a keyed todo is returned as is. */
export async function promoteTodo(ownerId: string, id: string, prefix?: string, via: TodoVia = 'ui'): Promise<Todo> {
  const todo = await getTodo(ownerId, id);
  if (todo.key) return todo;
  const value = prefix ?? (await db.select({ keyPrefix: epics.keyPrefix }).from(epics).where(and(eq(epics.id, todo.epicId), eq(epics.ownerId, ownerId))))[0]?.keyPrefix;
  if (!value) throw new TodoValidationError('No prefix: pass one, or set a default prefix on the epic');
  return updateTodo(ownerId, id, { prefix: value }, via);
}

/**
 * Idempotent: completing a done todo changes nothing and logs nothing — unless completedAt (YG-37) or actualMinutes (YG-43) is given,
 * which only sets those.
 */
export async function completeTodo(ownerId: string, id: string, via: TodoVia = 'ui', completedAt?: Date | string, actualMinutes?: number | null): Promise<Todo> {
  const current = await getTodo(ownerId, id);
  if (current.status !== 'done') return updateTodo(ownerId, id, { status: 'done', completedAt, actualMinutes }, via);
  return completedAt === undefined && actualMinutes === undefined ? current : updateTodo(ownerId, id, { completedAt, actualMinutes }, via);
}

/** YG-39 soft hide. Archived todos drop out of every list, the board, today, the calendar, resources and search; nothing is deleted. */
export async function setArchived(ownerId: string, id: string, archived: boolean, via: TodoVia = 'ui'): Promise<Todo> {
  return db.transaction(async (tx) => {
    const current = (await todoRows(and(eq(issues.id, id), eq(issues.ownerId, ownerId))!, tx, true))[0];
    if (!current) throw new NotFoundError();
    if (Boolean(current.archivedAt) === archived) return current;
    await tx.update(issues).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId)));
    await appendActivity(tx, ownerId, { kind: archived ? 'issue.archived' : 'issue.unarchived', subjectType: 'issue', subjectId: id, payload: { via } });
    return (await todoRows(eq(issues.id, id), tx))[0]!;
  });
}

export async function getTodo(ownerId: string, id: string): Promise<Todo> {
  const todo = (await todoRows(and(eq(issues.id, id), eq(issues.ownerId, ownerId))!))[0];
  if (!todo) throw new NotFoundError();
  return todo;
}

/** Resolves `{ id }` or `{ key: 'yg-24' }` (case-insensitive) to the owner's todo id. Archived todos resolve too. */
export async function todoIdOf(ownerId: string, ref: { id?: string; key?: string }): Promise<string> {
  if (ref.id) return ref.id;
  const row = (await db.select({ id: issues.id }).from(issues).where(and(eq(issues.ownerId, ownerId), eq(issues.key, ref.key!.trim().toUpperCase()))).limit(1))[0];
  if (!row) throw new NotFoundError();
  return row.id;
}

const active = isNull(issues.archivedAt);

export type TodoFilter = {
  status?: IssueStatus[]; area?: string; epic?: string; hold?: Hold | 'none'; dueBefore?: string; dueAfter?: string; hasKey?: boolean; q?: string;
  includeArchived?: boolean; limit?: number; cursor?: string;
};
/**
 * YG-39 list_todos. Default: open todos (backlog/todo/doing), unarchived. dueAfter is inclusive, dueBefore exclusive (date-only = 00:00 Asia/Seoul).
 * Done-only lists come most recently completed first. `cursor` is the next offset.
 * ponytail: filters in SQL, paging in memory — fine for one person's todos; move limit/offset into SQL if lists reach thousands.
 */
export async function listTodos(ownerId: string, filter: TodoFilter = {}): Promise<{ todos: Todo[]; nextCursor: string | null }> {
  const status = filter.status ?? ['backlog', 'todo', 'doing'];
  const pattern = filter.q && `%${filter.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await todoRows(and(eq(issues.ownerId, ownerId), inArray(issues.status, status),
    filter.includeArchived ? undefined : active,
    filter.area === undefined ? undefined : eq(goals.title, filter.area.trim()),
    filter.epic === undefined ? undefined : eq(epics.title, filter.epic.trim()),
    filter.hold === undefined ? undefined : filter.hold === 'none' ? isNull(issues.hold) : eq(issues.hold, filter.hold),
    filter.dueBefore === undefined ? undefined : sql`${issues.dueAt} < ${parseTodoDate(filter.dueBefore)}`,
    filter.dueAfter === undefined ? undefined : sql`${issues.dueAt} >= ${parseTodoDate(filter.dueAfter)}`,
    filter.hasKey === undefined ? undefined : filter.hasKey ? isNotNull(issues.key) : isNull(issues.key),
    pattern ? or(ilike(issues.title, pattern), ilike(issues.key, pattern), ilike(issues.notes, pattern)) : undefined)!,
    db, false, status.every((value) => value === 'done') ? [desc(issues.completedAt)] : undefined);
  const offset = Number(filter.cursor ?? 0);
  const limit = filter.limit ?? 50;
  return { todos: rows.slice(offset, offset + limit), nextCursor: offset + limit < rows.length ? String(offset + limit) : null };
}

/** Open todos in one area (Goal title), any hold. */
export async function listAreaTodos(ownerId: string, area: string): Promise<Todo[]> {
  return todoRows(and(eq(issues.ownerId, ownerId), ne(issues.status, 'done'), active, eq(goals.title, area.trim()))!);
}

export async function listAreas(ownerId: string): Promise<string[]> {
  return (await db.selectDistinct({ title: goals.title }).from(goals).where(eq(goals.ownerId, ownerId)).orderBy(asc(goals.title))).map((row) => row.title);
}

/**
 * today = open, not waiting/blocked (scheduled only once its day arrives), and due ≤ today, p1, or scheduled ≤ today — all in Asia/Seoul —
 * minus backlog todos due before today (YG-54).
 * overdue (YG-38) = all-day due before today, or timed due before now. Archived todos are left out. Shared by MCP todo://today and GET /api/todos/today.
 */
export async function todayView(ownerId: string, now = new Date()): Promise<TodayView> {
  const date = seoulDate(now);
  const day = (column: typeof issues.dueAt | typeof issues.scheduledAt, op: '<' | '<=' | '>=') => sql`(${column} AT TIME ZONE 'Asia/Seoul')::date ${sql.raw(op)} ${date}::date`;
  const open = and(eq(issues.ownerId, ownerId), ne(issues.status, 'done'), active)!;
  const weekEnd = seoulDate(new Date(now.getTime() + 7 * 86_400_000));
  const upcoming = (column: typeof issues.dueAt | typeof issues.scheduledAt) => sql`(${column} AT TIME ZONE 'Asia/Seoul')::date BETWEEN (${date}::date + 1) AND ${weekEnd}::date`;
  const [today, overdue, waiting, later, stale, calendar] = await Promise.all([
    // YG-54: a backlog todo due before today was put away on purpose — not 오늘 (web and MCP both read this list).
    todoRows(and(open, or(isNull(issues.hold), and(eq(issues.hold, 'scheduled'), day(issues.scheduledAt, '<='))), or(day(issues.dueAt, '<='), eq(issues.priority, 'p1'), day(issues.scheduledAt, '<=')),
      or(ne(issues.status, 'backlog'), isNull(issues.dueAt), day(issues.dueAt, '>=')))!),
    todoRows(and(open, sql`CASE WHEN ${issues.dueAllDay} THEN ${day(issues.dueAt, '<')} ELSE ${issues.dueAt} < ${now} END`)!),
    todoRows(and(open, inArray(issues.hold, ['waiting', 'blocked']))!),
    // 이번 주 예정 (YG-25): due or scheduled in the next 7 days, not waiting/blocked, not already in today.
    todoRows(and(open, or(isNull(issues.hold), eq(issues.hold, 'scheduled')), or(upcoming(issues.dueAt), upcoming(issues.scheduledAt)))!),
    staleView(ownerId, now),
    calendarView(ownerId, date, date, false, now)
  ]);
  const inToday = new Set(today.map((todo) => todo.id));
  // YG-34 밀린 일 = past-due by Seoul day ∪ stale, once each. Like YG-41, backlog and held todos are already put away (a held one only
  // comes back by going untouched). A timed todo due earlier today stays in 오늘.
  const days = (from: number, to: number) => Math.floor((to - from) / 86_400_000);
  const late = new Map<string, LateTodo>();
  for (const todo of [...overdue.filter((item) => item.status !== 'backlog' && !item.hold && seoulDate(new Date(item.dueAt!)) < date), ...stale.todos]) {
    if (late.has(todo.id)) continue;
    const lateDays = todo.dueAt && seoulDate(new Date(todo.dueAt)) < date ? days(Date.parse(seoulDate(new Date(todo.dueAt))), Date.parse(date)) : null;
    const untouchedDays = days(Date.parse(todo.updatedAt), now.getTime());
    const { stale: _, ...plain } = todo as Todo & { stale?: unknown };
    const age = lateDays ?? untouchedDays;
    late.set(todo.id, { ...plain, lateDays, untouchedDays, age, bucket: lateBucket(age) });
  }
  const timed = (todo: Todo) => todo.dueAt ? !todo.dueAllDay : !todo.scheduledAllDay;
  return {
    date, today, overdue, waiting, week: later.filter((todo) => !inToday.has(todo.id)),
    late: [...late.values()].sort((a, b) => b.age - a.age),
    timeline: { todos: calendar.todos.filter(timed), ghosts: calendar.ghosts.filter((ghost) => !ghost.allDay) }
  };
}

/**
 * YG-41 방치 감지 (suggest only). Stale = todo/doing, not archived, not in an active (unpaused) series, and
 * (a) due ≥ STALE_OVERDUE_DAYS ago — all-day by Asia/Seoul day, timed by instant — or (b) unchanged for ≥ STALE_UNTOUCHED_DAYS.
 * A held todo only counts by (b): there is no hold timestamp, so updated_at stands in for "held since".
 */
export async function staleView(ownerId: string, now = new Date()): Promise<StaleView> {
  const date = seoulDate(now);
  const dueCutoff = new Date(now.getTime() - STALE_OVERDUE_DAYS * 86_400_000);
  const touchCutoff = new Date(now.getTime() - STALE_UNTOUCHED_DAYS * 86_400_000);
  const overdue = and(isNull(issues.hold), sql`CASE WHEN ${issues.dueAllDay} THEN (${issues.dueAt} AT TIME ZONE 'Asia/Seoul')::date <= ${seoulDate(dueCutoff)}::date ELSE ${issues.dueAt} <= ${dueCutoff} END`);
  const rows = await todoRows(and(eq(issues.ownerId, ownerId), inArray(issues.status, ['todo', 'doing']), active,
    or(isNull(issues.recurrenceId), eq(recurrences.paused, true)), or(overdue, sql`${issues.updatedAt} <= ${touchCutoff}`))!);
  const days = (from: number, to: number) => Math.floor((to - from) / 86_400_000);
  return {
    date,
    todos: rows.map((todo) => {
      const late = todo.dueAt && !todo.hold ? todo.dueAllDay ? days(Date.parse(seoulDate(new Date(todo.dueAt))), Date.parse(date)) : days(Date.parse(todo.dueAt), now.getTime()) : 0;
      const idle = days(Date.parse(todo.updatedAt), now.getTime());
      return { ...todo, stale: { overdueDays: late >= STALE_OVERDUE_DAYS ? late : null, untouchedDays: idle >= STALE_UNTOUCHED_DAYS ? idle : null } };
    })
  };
}

export async function todoRows(where: SQL, executor: Transaction | typeof db = db, lock = false, order: SQL[] = []): Promise<Todo[]> {
  const query = executor.select({ issue: issues, area: goals.title, epic: epics.title, recurrence: recurrences }).from(issues)
    .innerJoin(epics, eq(issues.epicId, epics.id)).innerJoin(goals, eq(epics.goalId, goals.id)).leftJoin(recurrences, eq(issues.recurrenceId, recurrences.id)).where(where)
    .orderBy(...order, asc(issues.priority), sql`${issues.dueAt} ASC NULLS LAST`, asc(issues.position), asc(issues.id));
  return (await (lock ? query.for('update', { of: issues }) : query)).map((row) => ({ ...issue(row.issue), area: row.area, epic: row.epic, recurrence: toRecurrence(row.recurrence) }));
}

type Place = { epicId: string; area: string; epic: string; keyPrefix: string | null };
/**
 * Finds (or creates) the area Goal and Epic for each [area, epic] pair, in input order. One lookup query when they all exist;
 * only a miss takes the per-owner lock (so concurrent creates cannot duplicate a Goal/Epic) and re-reads before inserting.
 * YG-35: the lock used to be taken on every create, which serialized parallel creates for the whole transaction.
 */
async function resolveEpics(tx: Transaction, ownerId: string, pairs: [string, string][]): Promise<Place[]> {
  const wanted = pairs.map(([area, epic]) => [area.trim(), epic.trim()] as const);
  const areas = [...new Set(wanted.map(([area]) => area))];
  const titles = [...new Set(wanted.map(([, epic]) => epic))];
  const lookup = async () => {
    const rows = await tx.select({ goalId: goals.id, area: goals.title, epicId: epics.id, epic: epics.title, keyPrefix: epics.keyPrefix }).from(goals)
      .leftJoin(epics, and(eq(epics.goalId, goals.id), eq(epics.ownerId, ownerId), inArray(epics.title, titles)))
      .where(and(eq(goals.ownerId, ownerId), inArray(goals.title, areas))).orderBy(asc(goals.createdAt), asc(goals.id), asc(epics.createdAt), asc(epics.id));
    const goalOf = new Map<string, string>();
    const epicOf = new Map<string, { id: string; keyPrefix: string | null }>();
    for (const row of rows) {
      if (!goalOf.has(row.area)) goalOf.set(row.area, row.goalId);
      if (row.epicId && goalOf.get(row.area) === row.goalId && !epicOf.has(`${row.area}\n${row.epic}`)) epicOf.set(`${row.area}\n${row.epic}`, { id: row.epicId, keyPrefix: row.keyPrefix });
    }
    return { goalOf, epicOf };
  };
  let { goalOf, epicOf } = await lookup();
  if (wanted.some(([area, epic]) => !epicOf.has(`${area}\n${epic}`))) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
    ({ goalOf, epicOf } = await lookup());
    const newGoals = areas.filter((area) => !goalOf.has(area)).map((title) => ({ id: crypto.randomUUID(), ownerId, title }));
    if (newGoals.length) await tx.insert(goals).values(newGoals);
    for (const goal of newGoals) goalOf.set(goal.title, goal.id);
    const missing = [...new Set(wanted.filter(([area, epic]) => !epicOf.has(`${area}\n${epic}`)).map(([area, epic]) => `${area}\n${epic}`))];
    const newEpics = missing.map((key) => { const [area, title] = key.split('\n') as [string, string]; return { id: crypto.randomUUID(), ownerId, goalId: goalOf.get(area)!, title }; });
    if (newEpics.length) await tx.insert(epics).values(newEpics);
    missing.forEach((key, i) => epicOf.set(key, { id: newEpics[i]!.id, keyPrefix: null }));
  }
  return wanted.map(([area, epic]) => { const found = epicOf.get(`${area}\n${epic}`)!; return { epicId: found.id, keyPrefix: found.keyPrefix, area, epic }; });
}

/**
 * Next board position for each status, in order (several of one status get consecutive slots). `top` places the todo above the column
 * (just-completed todos lead the 완료 column); positions may go negative until the next board move renumbers them.
 * ponytail: unlocked, so concurrent creates can share a position; ties fall back to id order and the next board move renumbers.
 */
export async function nextPositions(tx: Transaction, ownerId: string, statuses: IssueStatus[], top = false): Promise<number[]> {
  const rows = await tx.select({ status: issues.status, min: sql<number>`coalesce(min(${issues.position}), 1)::int`, max: sql<number>`coalesce(max(${issues.position}), -1)::int` })
    .from(issues).where(and(eq(issues.ownerId, ownerId), inArray(issues.status, [...new Set(statuses)]))).groupBy(issues.status);
  const next = new Map(rows.map((row) => [row.status, top ? row.min - 1 : row.max + 1]));
  return statuses.map((status) => { const value = next.get(status) ?? 0; next.set(status, top ? value - 1 : value + 1); return value; });
}

function grouped<K>(entries: (readonly [K | undefined, number])[]): Map<K, number[]> {
  const out = new Map<K, number[]>();
  for (const [key, index] of entries) if (key !== undefined) out.set(key, [...out.get(key) ?? [], index]);
  return out;
}

export function columns(input: TodoChanges): Partial<typeof issues.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    const value = input[key];
    if (value !== undefined) out[key] = key === 'title' ? (value as string).trim() : value;
  }
  // YG-38: a date-only value is all-day; an instant (or a Date from server code) is timed; null clears both.
  for (const [key, flag] of [['dueAt', 'dueAllDay'], ['scheduledAt', 'scheduledAllDay']] as const) {
    const value = input[key];
    if (value !== undefined) Object.assign(out, { [key]: parseTodoDate(value), [flag]: typeof value === 'string' && dateOnly.test(value) });
  }
  if (input.completedAt !== undefined) out.completedAt = parseCompletedAt(input.completedAt);
  return out;
}

/**
 * YG-30 calendar range [from, to] (Asia/Seoul days, inclusive). Default calendar date is dueAt, else scheduledAt; due/scheduled select only that field.
 * `undated` = open todos with neither date. `ghosts` = upcoming occurrences of active series, computed with nextSlot
 * from the same anchor spawnNext would use (max(now, open occurrence's date)) — preview only, never stored.
 */
export async function calendarView(ownerId: string, from: string, to: string, withDone = false, now = new Date(), basis: CalendarDateBasis = 'effective'): Promise<CalendarView> {
  const selected = basis === 'due' ? sql`${issues.dueAt}` : basis === 'scheduled' ? sql`${issues.scheduledAt}` : sql`coalesce(${issues.dueAt}, ${issues.scheduledAt})`;
  const date = sql`(${selected} AT TIME ZONE 'Asia/Seoul')::date`;
  const mine = and(eq(issues.ownerId, ownerId), active)!;
  const notDone = ne(issues.status, 'done');
  const [todos, undated, open] = await Promise.all([
    todoRows(and(mine, sql`${date} BETWEEN ${from}::date AND ${to}::date`, withDone ? undefined : notDone)!),
    todoRows(and(mine, notDone, isNull(issues.dueAt), isNull(issues.scheduledAt))!),
    // One open occurrence per active series (spawnNext keeps it that way).
    todoRows(and(mine, notDone, eq(recurrences.paused, false))!)
  ]);
  const end = parseTodoDate(to)!.getTime() + 86_400_000;
  const start = parseTodoDate(from)!.getTime();
  const ghosts: CalendarGhost[] = [];
  for (const todo of open) {
    const rule = todo.recurrence!;
    const at = basis === 'due' ? todo.dueAt : basis === 'scheduled' ? todo.scheduledAt : todo.dueAt ?? todo.scheduledAt;
    if (basis !== 'effective' && !at) continue;
    const anchor = new Date(at ?? now);
    // ponytail: 400 slots per series covers a daily rule over the 62-day range cap.
    for (let slot = nextSlot(rule, anchor > now ? anchor : now), i = 0; slot.getTime() < end && i < 400; slot = nextSlot(rule, slot), i++)
      if (slot.getTime() >= start) ghosts.push({ recurrenceId: rule.id, todoId: todo.id, title: todo.title, priority: todo.priority, at: slot.toISOString(), allDay: !rule.time });
  }
  return { from, to, todos, undated, ghosts: ghosts.sort((a, b) => a.at.localeCompare(b.at)) };
}
