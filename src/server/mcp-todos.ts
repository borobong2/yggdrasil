import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Todo } from '../contracts/items.js';
import { formatDay } from '../contracts/dates.js';
import { recurrenceLabel } from '../contracts/recurrence.js';
import { staleReasons } from '../contracts/stale.js';
import { result } from './mcp.js';
import { todoResourceExtras } from './mcp-documents.js';
import { linkEdits } from './links.js';
import {
  completedAtInput, completeTodo, createTodo, createTodos, getTodo, keyPrefix as prefix, listAreas, listAreaTodos, listTodos, setArchived, staleView, todayView, todoFields, todoIdOf,
  todoName as name, updateTodo
} from './todos.js';

// Todo tools and todo:// resources (YG-14/15, YG-35/37/39/40). User-requested todo writes are the approval (design §4-1);
// every write logs via=mcp. No hard delete by design: archive_todo hides, unarchive_todo brings back.
const todoWrite = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ref = {
  id: z.uuid().describe('Todo id. Pass exactly one of id or key.'),
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{0,9}-[1-9]\d*$/).describe("Ticket key like 'YG-24' (case-insensitive). Pass exactly one of id or key.")
};
const oneRef = (input: { id?: string; key?: string }) => (input.id === undefined) !== (input.key === undefined);
const refOnly = z.object(ref).partial().strict().refine(oneRef, 'Pass exactly one of id or key');
const createItem = z.object({ area: name, ...todoFields, prefix: prefix.nullable().describe("Ticket key prefix, e.g. 'YG' → next key YG-<n>. Omit to use the epic's default prefix (if it has one); null for no key.") }).partial().required({ area: true, title: true }).strict();

export function registerTodoTools(server: McpServer, ownerId: string): void {
  server.registerTool('create_todo', {
    description: 'Create a todo in an area (커리어, 개인, 루틴, 잡일, 수익화, 부동산, 결혼, …). Missing area/epic are created. Defaults: status todo, priority p3. dueAt/scheduledAt as a date is all-day, as a timestamp is timed. Optional recurrence makes it a repeating series (dueAt defaults to the first slot). An epic with a default ticket prefix (e.g. 프로젝트/yggdrasil → YG) gives the todo its next key unless prefix is null. For several todos use create_todos.',
    inputSchema: createItem, annotations: todoWrite
  }, (input) => result(() => createTodo(ownerId, input, 'mcp')));
  server.registerTool('create_todos', {
    description: 'Create up to 50 todos (same fields as create_todo) in one transaction: all or nothing. Keys are assigned in item order. Returns the created todos in order.',
    inputSchema: z.object({ items: z.array(createItem).min(1).max(50) }).strict(), annotations: todoWrite
  }, ({ items }) => result(() => createTodos(ownerId, items, 'mcp')));
  server.registerTool('get_todo', {
    description: 'Read one of your todos (full notes) by id or ticket key, archived ones included.',
    inputSchema: refOnly, annotations: readOnly
  }, (input) => result(async () => getTodo(ownerId, await todoIdOf(ownerId, input))));
  server.registerTool('list_todos', {
    description: 'List your todos, compact (notes cut to 120 characters unless includeNotes). Default: open (backlog/todo/doing), not archived. Done-only lists are newest completion first; otherwise priority, then due date. dueAfter is inclusive, dueBefore exclusive. Pass nextCursor back as cursor for more.',
    inputSchema: z.object({
      status: z.array(todoFields.status).min(1).max(4).optional(), area: name.optional(), epic: name.optional(),
      hold: z.enum(['waiting', 'blocked', 'scheduled', 'none']).optional(), dueBefore: todoFields.dueAt.unwrap().optional(), dueAfter: todoFields.dueAt.unwrap().optional(),
      hasKey: z.boolean().optional(), q: z.string().trim().min(1).max(200).optional().describe('Substring of title, key or notes'),
      includeArchived: z.boolean().optional(), includeNotes: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).optional().describe('Default 50'), cursor: z.string().regex(/^\d{1,6}$/).optional()
    }).strict().default({}), annotations: readOnly
  }, ({ includeNotes, ...filter }) => result(async () => {
    const page = await listTodos(ownerId, filter);
    return { todos: page.todos.map((todo) => compact(todo, includeNotes)), nextCursor: page.nextCursor };
  }));
  server.registerTool('update_todo', {
    description: 'Update fields of your todo (by id or key); set area/epic to move it. Use null to clear dueAt, hold, holdReason, scheduledAt, estimateMinutes, actualMinutes. recurrence replaces the repeat rule (null ends the series); changing dueAt only moves this occurrence. completedAt only applies to a done todo.',
    inputSchema: z.object({ ...ref, area: name, ...todoFields, completedAt: completedAtInput, prefix, ...linkEdits }).partial().strict()
      .refine(oneRef, 'Pass exactly one of id or key').refine((input) => Object.keys(input).length > 1, 'No changes'), annotations: todoWrite
  }, ({ id, key, ...changes }) => result(async () => updateTodo(ownerId, await todoIdOf(ownerId, { id, key }), changes, 'mcp')));
  server.registerTool('complete_todo', {
    description: 'Mark your todo done (by id or key), optionally when it was really done (completedAt) and how many minutes it really took (actualMinutes). Completing a done todo changes nothing unless completedAt or actualMinutes is given. Completing a repeating todo creates its next occurrence after the later of its slot and completedAt.',
    inputSchema: z.object({ ...ref, completedAt: completedAtInput, actualMinutes: todoFields.actualMinutes.unwrap() }).partial().strict().refine(oneRef, 'Pass exactly one of id or key'), annotations: { ...todoWrite, idempotentHint: true }
  }, ({ completedAt, actualMinutes, ...input }) => result(async () => completeTodo(ownerId, await todoIdOf(ownerId, input), 'mcp', completedAt, actualMinutes)));
  server.registerTool('archive_todo', {
    description: 'Hide your todo (by id or key) from every list, the board, today, the calendar and search. Nothing is deleted; unarchive_todo brings it back.',
    inputSchema: refOnly, annotations: { ...todoWrite, idempotentHint: true }
  }, (input) => result(async () => setArchived(ownerId, await todoIdOf(ownerId, input), true, 'mcp')));
  server.registerTool('unarchive_todo', {
    description: 'Bring back an archived todo (by id or key).',
    inputSchema: refOnly, annotations: { ...todoWrite, idempotentHint: true }
  }, (input) => result(async () => setArchived(ownerId, await todoIdOf(ownerId, input), false, 'mcp')));
  registerTodoResources(server, ownerId);
}

export const clip = (notes: string) => notes.length > 120 ? `${notes.slice(0, 120)}…` : notes;

/** list_todos item: no board bookkeeping, nulls dropped, recurrence as a label. */
function compact(todo: Todo, includeNotes = false) {
  const { epicId: _epicId, position: _position, createdAt: _createdAt, github: _github, recurrence, notes, ...rest } = todo;
  return Object.fromEntries(Object.entries({ ...rest, recurrence: recurrence && recurrenceLabel(recurrence), notes: includeNotes ? notes : clip(notes) })
    .filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

// Read-only markdown for @-mentions (todo://today etc.). Dates shown in Asia/Seoul: all-day as the date, timed with HH:mm.
function registerTodoResources(server: McpServer, ownerId: string) {
  const views = [['today', '오늘 할 일'], ['overdue', '마감 지남'], ['waiting', '대기·막힘']] as const;
  for (const [key, title] of views) {
    server.registerResource(`todo-${key}`, `todo://${key}`, { title, mimeType: 'text/markdown' }, async (uri) => {
      const [view, stale] = await Promise.all([todayView(ownerId), key === 'today' ? staleView(ownerId) : undefined]);
      return markdown(uri, list(`${title} (${view.date})${stale ? ` · 방치 ${stale.todos.length}건` : ''}`, view[key]));
    });
  }
  // YG-41: suggestions only — the reader decides what to do with them.
  server.registerResource('todo-stale', 'todo://stale', { title: '방치된 할 일', mimeType: 'text/markdown' }, async (uri) => {
    const view = await staleView(ownerId);
    return markdown(uri, `# 방치된 할 일 (${view.date})\n\n${view.todos.length ? view.todos.map((todo) => `${line(todo)} — ${staleReasons(todo.stale).join(' · ')}`).join('\n') : '_없음_'}\n`);
  });
  const area = new ResourceTemplate('todo://area/{name}', {
    list: async () => ({ resources: (await listAreas(ownerId)).map((name) => ({ uri: `todo://area/${encodeURIComponent(name)}`, name: `todo-area-${name}`, title: `영역: ${name}`, mimeType: 'text/markdown' })) })
  });
  server.registerResource('todo-area', area, { title: '영역별 할 일', mimeType: 'text/markdown' }, async (uri, { name }) => {
    const value = decodeURIComponent(String(name));
    return markdown(uri, list(`영역: ${value}`, await listAreaTodos(ownerId, value)));
  });
  server.registerResource('todo-issue', new ResourceTemplate('todo://issue/{id}', { list: undefined }), { title: '할 일 상세', mimeType: 'text/markdown' }, async (uri, { id }) => {
    const todo = z.uuid().safeParse(id).success ? await getTodo(ownerId, String(id)).catch(() => undefined) : undefined;
    if (!todo) throw new Error('Todo not found');
    return markdown(uri, detail(todo) + await todoResourceExtras(ownerId, todo));
  });
}

const due = (todo: Todo) => todo.dueAt && formatDay(todo.dueAt, todo.dueAllDay);
const scheduled = (todo: Todo) => todo.scheduledAt && formatDay(todo.scheduledAt, todo.scheduledAllDay);
function markdown(uri: URL, text: string) { return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }; }
function list(title: string, todos: Todo[]) { return `# ${title}\n\n${todos.length ? todos.map(line).join('\n') : '_없음_'}\n`; }
function line(todo: Todo) {
  const parts = [todo.priority.toUpperCase(), `${todo.area}/${todo.epic}`, todo.status, todo.dueAt && `마감 ${due(todo)}`, todo.scheduledAt && `예정 ${scheduled(todo)}`, todo.hold && [todo.hold, todo.holdReason].filter(Boolean).join(': '), todo.recurrence && `반복 ${recurrenceLabel(todo.recurrence)}`];
  return `- [${todo.status === 'done' ? 'x' : ' '}] ${todo.key ? `${todo.key}: ` : ''}${todo.title} — ${parts.filter(Boolean).join(' · ')} (id: ${todo.id})`;
}
function detail(todo: Todo) {
  const rows = [['키', todo.key], ['id', todo.id], ['영역', `${todo.area}/${todo.epic}`], ['상태', todo.status], ['우선순위', todo.priority.toUpperCase()], ['마감', due(todo)], ['예정', scheduled(todo)],
    ['완료', todo.completedAt && formatDay(todo.completedAt, false)], ['보관', todo.archivedAt && formatDay(todo.archivedAt, false)],
    ['보류', todo.hold && [todo.hold, todo.holdReason].filter(Boolean).join(': ')], ['예상', todo.estimateMinutes && `${todo.estimateMinutes}분`], ['실제', todo.actualMinutes && `${todo.actualMinutes}분`], ['반복', todo.recurrence && recurrenceLabel(todo.recurrence)], ['출처', todo.source]];
  return `# ${todo.title}\n\n${rows.filter(([, value]) => value).map(([label, value]) => `- ${label}: ${value}`).join('\n')}\n${todo.notes ? `\n## 메모\n\n${todo.notes}\n` : ''}`;
}
