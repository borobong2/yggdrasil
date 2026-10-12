import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Hold, IssueStatus, Priority, TodayView, Todo, TodoVia } from '../contracts/items.js';
import { appendActivity, type Transaction } from './activity.js';
import { getDb } from './db.js';
import { epics, goals, issues } from './schema.js';
import { NotFoundError, issue } from './work.js';
import { allocateKey } from './ticket-keys.js';

const db = getDb();
export const DEFAULT_EPIC = '일반';

// Shared input validation for every todo write surface (MCP tools, HTTP routes).
export const todoName = z.string().trim().min(1).max(200);
const day = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).describe("'YYYY-MM-DD' (Asia/Seoul) or ISO timestamp");
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
  estimateMinutes: z.number().int().positive().max(100_000).nullable()
};
export const todoChanges = z.object({ area: todoName, ...todoFields }).partial().strict().refine((input) => Object.keys(input).length > 0, 'No changes');

/** Date-only strings ('YYYY-MM-DD') are midnight in Asia/Seoul; anything else must be an ISO timestamp. */
export type DateInput = Date | string | null;
export type TodoInput = {
  area: string; epic?: string; title: string; status?: IssueStatus; priority?: Priority; dueAt?: DateInput;
  hold?: Hold | null; holdReason?: string | null; scheduledAt?: DateInput; notes?: string; estimateMinutes?: number | null; source?: string | null;
  /** Ticket key prefix (e.g. 'YG'): assigns the next key on create, or on update when the todo has none. */
  prefix?: string;
};
/** `area` alone moves the todo to that area's default Epic; `epic` alone moves it within its current area. */
export type TodoChanges = Partial<TodoInput>;

const fields = ['title', 'status', 'priority', 'dueAt', 'hold', 'holdReason', 'scheduledAt', 'notes', 'estimateMinutes', 'source'] as const;

export function parseTodoDate(value: DateInput): Date | null {
  if (value === null || value instanceof Date) return value;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00` : value);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${value}`);
  return date;
}

export function seoulDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

export async function createTodo(ownerId: string, input: TodoInput, via: TodoVia = 'ui'): Promise<Todo> {
  return db.transaction(async (tx) => {
    const place = await resolveEpic(tx, ownerId, input.area, input.epic ?? DEFAULT_EPIC);
    const status = input.status ?? 'todo';
    const [row] = await tx.insert(issues).values({ ...columns(input), id: crypto.randomUUID(), ownerId, epicId: place.epicId, title: input.title.trim(), status, position: await nextPosition(tx, ownerId, status), key: input.prefix ? await allocateKey(tx, ownerId, input.prefix) : null }).returning();
    await appendActivity(tx, ownerId, { kind: 'issue.created', subjectType: 'issue', subjectId: row!.id, payload: { via, area: place.area, epic: place.epic } });
    return { ...issue(row!), area: place.area, epic: place.epic };
  });
}

export async function updateTodo(ownerId: string, id: string, changes: TodoChanges, via: TodoVia = 'ui'): Promise<Todo> {
  return db.transaction(async (tx) => {
    const current = (await todoRows(and(eq(issues.id, id), eq(issues.ownerId, ownerId))!, tx, true))[0];
    if (!current) throw new NotFoundError();
    const changed = Object.keys(changes).filter((key) => changes[key as keyof TodoChanges] !== undefined);
    if (!changed.length) return current;
    const place = changes.area === undefined && changes.epic === undefined
      ? { epicId: current.epicId, area: current.area, epic: current.epic }
      : await resolveEpic(tx, ownerId, changes.area ?? current.area, changes.epic ?? (changes.area === undefined ? current.epic : DEFAULT_EPIC));
    const set = columns(changes);
    if (changes.prefix && !current.key) set.key = await allocateKey(tx, ownerId, changes.prefix);
    if (set.status && set.status !== current.status) set.position = await nextPosition(tx, ownerId, set.status, set.status === 'done');
    const [row] = await tx.update(issues).set({ ...set, epicId: place.epicId, updatedAt: new Date() }).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).returning();
    const kind = set.status === 'done' && current.status !== 'done' ? 'issue.completed' : 'issue.updated';
    await appendActivity(tx, ownerId, { kind, subjectType: 'issue', subjectId: id, payload: { via, changes: changed } });
    return { ...issue(row!), area: place.area, epic: place.epic };
  });
}

/** Idempotent: completing a done todo changes nothing and logs nothing. */
export async function completeTodo(ownerId: string, id: string, via: TodoVia = 'ui'): Promise<Todo> {
  const current = await getTodo(ownerId, id);
  return current.status === 'done' ? current : updateTodo(ownerId, id, { status: 'done' }, via);
}

export async function getTodo(ownerId: string, id: string): Promise<Todo> {
  const todo = (await todoRows(and(eq(issues.id, id), eq(issues.ownerId, ownerId))!))[0];
  if (!todo) throw new NotFoundError();
  return todo;
}

/** Open todos in one area (Goal title), any hold. */
export async function listAreaTodos(ownerId: string, area: string): Promise<Todo[]> {
  return todoRows(and(eq(issues.ownerId, ownerId), ne(issues.status, 'done'), eq(goals.title, area.trim()))!);
}

export async function listAreas(ownerId: string): Promise<string[]> {
  return (await db.selectDistinct({ title: goals.title }).from(goals).where(eq(goals.ownerId, ownerId)).orderBy(asc(goals.title))).map((row) => row.title);
}

/** today = open, not waiting/blocked (scheduled only once its day arrives), and due ≤ today, p1, or scheduled ≤ today — all in Asia/Seoul. Shared by MCP todo://today and GET /api/todos/today. */
export async function todayView(ownerId: string, now = new Date()): Promise<TodayView> {
  const date = seoulDate(now);
  const day = (column: typeof issues.dueAt | typeof issues.scheduledAt, op: '<' | '<=') => sql`(${column} AT TIME ZONE 'Asia/Seoul')::date ${sql.raw(op)} ${date}::date`;
  const open = and(eq(issues.ownerId, ownerId), ne(issues.status, 'done'))!;
  const weekEnd = seoulDate(new Date(now.getTime() + 7 * 86_400_000));
  const upcoming = (column: typeof issues.dueAt | typeof issues.scheduledAt) => sql`(${column} AT TIME ZONE 'Asia/Seoul')::date BETWEEN (${date}::date + 1) AND ${weekEnd}::date`;
  const [today, overdue, waiting, later] = await Promise.all([
    todoRows(and(open, or(isNull(issues.hold), and(eq(issues.hold, 'scheduled'), day(issues.scheduledAt, '<='))), or(day(issues.dueAt, '<='), eq(issues.priority, 'p1'), day(issues.scheduledAt, '<=')))!),
    todoRows(and(open, day(issues.dueAt, '<'))!),
    todoRows(and(open, inArray(issues.hold, ['waiting', 'blocked']))!),
    // 이번 주 예정 (YG-25): due or scheduled in the next 7 days, not waiting/blocked, not already in today.
    todoRows(and(open, or(isNull(issues.hold), eq(issues.hold, 'scheduled')), or(upcoming(issues.dueAt), upcoming(issues.scheduledAt)))!)
  ]);
  const inToday = new Set(today.map((todo) => todo.id));
  return { date, today, overdue, waiting, week: later.filter((todo) => !inToday.has(todo.id)) };
}

export async function todoRows(where: SQL, executor: Transaction | typeof db = db, lock = false): Promise<Todo[]> {
  const query = executor.select({ issue: issues, area: goals.title, epic: epics.title }).from(issues)
    .innerJoin(epics, eq(issues.epicId, epics.id)).innerJoin(goals, eq(epics.goalId, goals.id)).where(where)
    .orderBy(asc(issues.priority), sql`${issues.dueAt} ASC NULLS LAST`, asc(issues.position), asc(issues.id));
  return (await (lock ? query.for('update', { of: issues }) : query)).map((row) => ({ ...issue(row.issue), area: row.area, epic: row.epic }));
}

// Finds or creates the area Goal and its Epic by name; the per-owner lock keeps concurrent creates from duplicating them.
async function resolveEpic(tx: Transaction, ownerId: string, area: string, epic: string) {
  const [areaTitle, epicTitle] = [area.trim(), epic.trim()];
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 0))`);
  const goal = (await tx.select({ id: goals.id }).from(goals).where(and(eq(goals.ownerId, ownerId), eq(goals.title, areaTitle))).orderBy(asc(goals.createdAt), asc(goals.id)).limit(1))[0]
    ?? (await tx.insert(goals).values({ id: crypto.randomUUID(), ownerId, title: areaTitle }).returning({ id: goals.id }))[0]!;
  const found = (await tx.select({ id: epics.id }).from(epics).where(and(eq(epics.ownerId, ownerId), eq(epics.goalId, goal.id), eq(epics.title, epicTitle))).orderBy(asc(epics.createdAt), asc(epics.id)).limit(1))[0]
    ?? (await tx.insert(epics).values({ id: crypto.randomUUID(), ownerId, goalId: goal.id, title: epicTitle }).returning({ id: epics.id }))[0]!;
  return { epicId: found.id, area: areaTitle, epic: epicTitle };
}

// `top` places the todo above the column (just-completed todos lead the 완료 column); positions may go negative until the next board move renumbers them.
export async function nextPosition(tx: Transaction, ownerId: string, status: IssueStatus, top = false): Promise<number> {
  const next = top ? sql<number>`coalesce(min(${issues.position}), 1)::int - 1` : sql<number>`coalesce(max(${issues.position}), -1)::int + 1`;
  const [row] = await tx.select({ next }).from(issues).where(and(eq(issues.ownerId, ownerId), eq(issues.status, status)));
  return row!.next;
}

export function columns(input: TodoChanges): Partial<typeof issues.$inferInsert> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    const value = input[key];
    if (value !== undefined) out[key] = key === 'dueAt' || key === 'scheduledAt' ? parseTodoDate(value as DateInput) : key === 'title' ? (value as string).trim() : value;
  }
  return out;
}
