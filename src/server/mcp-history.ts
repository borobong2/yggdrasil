import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { activityChanges, activityWhat, activityWho } from '../contracts/activity.js';
import { formatDay } from '../contracts/dates.js';
import { getDb } from './db.js';
import { getDocument } from './documents.js';
import { result } from './mcp.js';
import { activities, documents, issues } from './schema.js';
import { getTodo, parseTodoDate, todoIdOf } from './todos.js';

// YG-44 변경 이력: read-only view over the activity log. Owner-scoped like every other read; a todo/document filter
// resolves through getTodo/getDocument first, so another owner's id is "Not found".
const vias = ['mcp', 'ui', 'github', 'import', 'bulk'] as const;
type Via = typeof vias[number];
const day = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
export type HistoryFilter = { todo?: string; document?: string; since?: string; until?: string; via?: Via; limit?: number };
export type HistoryItem = { at: string; what: string; who?: string; subject?: string; changes?: string[] };

export function registerHistoryTools(server: McpServer, ownerId: string): void {
  server.registerTool('get_history', {
    description: 'Change history (변경 이력) from the activity log, oldest first: when (Asia/Seoul), what (생성/수정/완료/이동/보관/문서 연결/PR 열림 …), who (Claude·Codex via mcp, 웹 via ui, GitHub), and changed fields as "field: old → new" (older rows list field names only). '
      + "Filter by one todo (id or key like 'YG-24') or one document; without either it is your recent activity (default last 7 days). since inclusive, until exclusive ('YYYY-MM-DD' = Asia/Seoul day; until a date includes that day). via 'bulk' = bulk actions. Returns the latest `limit` rows.",
    inputSchema: z.object({
      todo: z.string().trim().min(1).max(64).optional().describe("Todo id (uuid) or ticket key like 'YG-24'"), document: z.uuid().optional(),
      since: day.optional(), until: day.optional(), via: z.enum(vias).optional(), limit: z.number().int().min(1).max(200).default(30)
    }).strict().refine((input) => !(input.todo && input.document), 'Pass todo or document, not both'),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, (input) => result(() => history(ownerId, input)));
  server.registerResource('todo-history', new ResourceTemplate('todo://history/{id}', { list: undefined }), { title: '변경 이력', mimeType: 'text/markdown' }, async (uri, { id }) => {
    const todo = await getTodo(ownerId, await todoIdOf(ownerId, ref(String(id)))).catch(() => undefined);
    if (!todo) throw new Error('Todo not found');
    const { items } = await history(ownerId, { todo: todo.id, limit: 200 });
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# 변경 이력: ${todo.key ? `${todo.key} ` : ''}${todo.title}\n\n${items.length ? items.map(line).join('\n') : '_없음_'}\n` }] };
  });
}

/** Markdown appended to todo://issue/{id}: its last 5 history lines (full list at todo://history/{id}). */
export async function historyLines(ownerId: string, todoId: string): Promise<string> {
  const { items } = await history(ownerId, { todo: todoId, limit: 5 });
  return items.length ? `\n## 최근 변경 이력\n\n${items.map(line).join('\n')}\n\n전체: todo://history/${todoId}\n` : '';
}

export async function history(ownerId: string, filter: HistoryFilter, now = new Date()) {
  const todo = filter.todo ? await getTodo(ownerId, await todoIdOf(ownerId, ref(filter.todo))) : undefined;
  const doc = filter.document ? await getDocument(ownerId, filter.document) : undefined;
  const since = filter.since ? parseTodoDate(filter.since)! : todo || doc ? undefined : new Date(now.getTime() - 7 * 86_400_000);
  const until = !filter.until ? undefined : dateOnly.test(filter.until) ? new Date(parseTodoDate(filter.until)!.getTime() + 86_400_000) : parseTodoDate(filter.until)!;
  const via = (v: string) => sql`${activities.payload}->>'via' = ${v}`;
  const where: (SQL | undefined)[] = [
    eq(activities.ownerId, ownerId),
    // A todo's history includes document rows that name it (link/unlink, create with linkTodos).
    todo && or(and(eq(activities.subjectType, 'issue'), eq(activities.subjectId, todo.id)), sql`${activities.payload}->>'issueId' = ${todo.id}`, sql`${activities.payload}->'linkedIssueIds' ? ${todo.id}`),
    doc && and(eq(activities.subjectType, 'document'), eq(activities.subjectId, doc.id)),
    since && gte(activities.createdAt, since), until && lt(activities.createdAt, until),
    // Board moves logged before YG-44 have no via; they could only come from the web.
    filter.via === 'bulk' ? sql`${activities.payload} ? 'bulk'` : filter.via === 'ui' ? or(via('ui'), and(eq(activities.kind, 'issue.moved'), isNull(sql`${activities.payload}->>'via'`))) : filter.via ? via(filter.via) : undefined
  ];
  // ponytail: rows written in one transaction share created_at, so their relative order is by id (arbitrary); add a sequence column if that matters.
  const rows = (await getDb().select().from(activities).where(and(...where)).orderBy(desc(activities.createdAt), desc(activities.id)).limit(filter.limit ?? 30)).reverse();
  const subjects = todo || doc ? new Map<string, string>() : await subjectNames(ownerId, rows);
  const items: HistoryItem[] = rows.map((row) => {
    const changes = activityChanges(row);
    return { at: formatDay(row.createdAt.toISOString(), false), what: activityWhat(row), who: activityWho(row) ?? undefined, subject: subjects.get(row.subjectId), changes: changes.length ? changes : undefined };
  });
  return { subject: todo ? { todo: { id: todo.id, key: todo.key, title: todo.title } } : doc ? { document: { id: doc.id, title: doc.title } } : null, since: since?.toISOString() ?? null, items };
}

const ref = (value: string) => z.uuid().safeParse(value).success ? { id: value } : { key: value };
const line = (item: HistoryItem) => `- ${[item.at, item.what, item.who, item.subject, item.changes?.join('; ')].filter(Boolean).join(' · ')}`;

/** 'YG-24 제목' / '제목' / '문서: 제목' for owner-wide history rows. */
async function subjectNames(ownerId: string, rows: (typeof activities.$inferSelect)[]): Promise<Map<string, string>> {
  const ids = (type: string) => [...new Set(rows.filter((row) => row.subjectType === type).map((row) => row.subjectId))];
  const [todos, docs] = await Promise.all([
    ids('issue').length ? getDb().select({ id: issues.id, key: issues.key, title: issues.title }).from(issues).where(and(eq(issues.ownerId, ownerId), inArray(issues.id, ids('issue')))) : [],
    ids('document').length ? getDb().select({ id: documents.id, title: documents.title }).from(documents).where(and(eq(documents.ownerId, ownerId), inArray(documents.id, ids('document')))) : []
  ]);
  return new Map([...todos.map((row) => [row.id, `${row.key ? `${row.key} ` : ''}${row.title}`] as const), ...docs.map((row) => [row.id, `문서: ${row.title}`] as const)]);
}
