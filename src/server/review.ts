import { and, asc, eq, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { addDays, isoWeek, reviewDocumentTitle, weekStart, type ReviewVia, type WeekReview } from '../contracts/review.js';
import { seoulDay } from '../contracts/dates.js';
import { getDb } from './db.js';
import { activities, documents, issues } from './schema.js';
import { staleView, todoRows } from './todos.js';

const db = getDb();
const vias: ReviewVia[] = ['ui', 'mcp', 'github', 'import'];

/**
 * YG-43 주간 회고 for the Asia/Seoul week (Mon–Sun) containing `date` (default: this week). Archived todos are left out.
 * ponytail: per-week aggregation in JS over one person's rows; move sums into SQL if a week ever holds thousands of todos.
 */
export async function weekReview(ownerId: string, date?: string, now = new Date()): Promise<WeekReview> {
  const start = weekStart(date ?? now);
  const end = addDays(start, 6);
  const from = new Date(`${start}T00:00:00+09:00`);
  const to = new Date(`${addDays(start, 7)}T00:00:00+09:00`);
  const until = now < to ? now : to;
  const lastDay = seoulDay(now) < end ? seoulDay(now) : end;
  const mine = and(eq(issues.ownerId, ownerId), isNull(issues.archivedAt));
  const dueDay = sql`(${issues.dueAt} AT TIME ZONE 'Asia/Seoul')::date`;
  // All-day: overdue once its day is over (next 00:00 Seoul); timed: once the instant passes.
  const overdueAt = sql`CASE WHEN ${issues.dueAllDay} THEN ${issues.dueAt} + interval '1 day' ELSE ${issues.dueAt} END`;

  const [completed, unfinished, overdue, stale, counts, document] = await Promise.all([
    todoRows(and(mine, eq(issues.status, 'done'), gte(issues.completedAt, from), lt(issues.completedAt, to))!, db, false, [asc(issues.completedAt)]),
    // Due on a day of the week that has started, and not done by the week's end.
    todoRows(and(mine, sql`${dueDay} BETWEEN ${start}::date AND ${lastDay}::date`, or(ne(issues.status, 'done'), gte(issues.completedAt, to)))!),
    todoRows(and(mine, ne(issues.status, 'done'), sql`${overdueAt} >= ${from} AND ${overdueAt} <= ${until}`)!),
    staleView(ownerId, now),
    db.select({ kind: activities.kind, via: sql<string>`coalesce(${activities.payload}->>'via', 'ui')`, n: sql<number>`count(*)::int` }).from(activities)
      .where(and(eq(activities.ownerId, ownerId), eq(activities.subjectType, 'issue'), gte(activities.createdAt, from), lt(activities.createdAt, to)))
      .groupBy(activities.kind, sql`2`),
    db.select({ id: documents.id }).from(documents)
      .where(and(eq(documents.ownerId, ownerId), eq(documents.title, reviewDocumentTitle(start)), isNull(documents.archivedAt))).orderBy(asc(documents.createdAt)).limit(1)
  ]);

  const areas = new Map<string, number>();
  for (const todo of completed) areas.set(todo.area, (areas.get(todo.area) ?? 0) + 1);
  const compared = completed.filter((todo) => todo.estimateMinutes && todo.actualMinutes);
  const estimated = compared.reduce((sum, todo) => sum + todo.estimateMinutes!, 0);
  const actual = compared.reduce((sum, todo) => sum + todo.actualMinutes!, 0);
  const count = (kind: string) => counts.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.n, 0);
  const via = Object.fromEntries(vias.map((name) => [name, counts.filter((row) => row.via === name).reduce((sum, row) => sum + row.n, 0)])) as Record<ReviewVia, number>;

  return {
    start, end, week: isoWeek(start),
    completed,
    byArea: [...areas].map(([area, n]) => ({ area, count: n })).sort((a, b) => b.count - a.count || a.area.localeCompare(b.area)),
    minutes: { compared: compared.length, estimated, actual, ratio: estimated ? Math.round((actual / estimated) * 100) / 100 : null },
    unfinished, overdue,
    stale: stale.todos.length,
    activity: { created: count('issue.created'), completed: count('issue.completed'), moved: count('issue.moved'), via },
    documentId: document[0]?.id ?? null
  };
}
