import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createCapture } from './captures.js';
import { getDocument } from './documents.js';
import { planningTree } from './planning.js';
import { searchWorkspace } from './search.js';
import { findDeliveryPlanCapture, generateDeliveryPlan } from './delivery-plans.js';
import { AIConfigurationRequired, generateOpenAIDeliveryPlan, type DeliveryPlanProvider } from './openai.js';
import { NotFoundError } from './work.js';
import type { Todo } from '../contracts/items.js';
import { completeTodo, createTodo, getTodo, listAreas, listAreaTodos, seoulDate, todayView, todoFields, todoName as name, updateTodo } from './todos.js';

export function createMcpServer(ownerId: string, provider: DeliveryPlanProvider = generateOpenAIDeliveryPlan) {
  const server = new McpServer({ name: 'yggdrasil', version: '0.1.0' });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const captureOnly = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  server.registerTool('search_workspace', {
    description: 'Search your documents, goals, epics, issues and captures (up to 50 results).',
    inputSchema: z.object({ q: z.string().trim().max(200) }).strict(), annotations: readOnly
  }, ({ q }) => result(() => searchWorkspace(ownerId, q)));
  server.registerTool('read_document', {
    description: 'Read a document owned by you.',
    inputSchema: z.object({ id: z.string().uuid() }).strict(), annotations: readOnly
  }, ({ id }) => result(() => getDocument(ownerId, id)));
  server.registerTool('read_planning_tree', {
    description: 'Read your Goal → Epic → Issue hierarchy and progress.',
    inputSchema: z.object({}).strict().default({}), annotations: readOnly
  }, () => result(() => planningTree(ownerId)));
  server.registerTool('create_capture', {
    description: 'Preserve a new capture in your inbox. Does not create planned work.',
    inputSchema: z.object({ text: z.string().trim().min(1).max(100_000) }).strict(), annotations: captureOnly
  }, ({ text }) => result(() => createCapture(ownerId, text)));
  server.registerTool('request_delivery_plan', {
    description: 'Generate a pending proposal from your capture. Human approval in the UI is required to create work.',
    inputSchema: z.object({ captureId: z.string().uuid() }).strict(),
    annotations: { ...captureOnly, openWorldHint: true }
  }, ({ captureId }) => result(async () => {
    const capture = await findDeliveryPlanCapture(ownerId, captureId);
    if (!capture) throw new NotFoundError();
    return generateDeliveryPlan(ownerId, capture, provider);
  }));
  // User-requested todo writes are the approval (design §4-1); every write logs via=mcp. No delete tool by design.
  const todoWrite = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const prefix = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{0,9}$/).describe("Ticket key prefix, e.g. 'YG' → next key YG-<n>. On update, only assigns a key when the todo has none.");
  server.registerTool('create_todo', {
    description: 'Create a todo in an area (커리어, 개인, 루틴, 잡일, 수익화, 부동산, 결혼, …). Missing area/epic are created. Defaults: status todo, priority p3.',
    inputSchema: z.object({ area: name, ...todoFields, prefix }).partial().required({ area: true, title: true }).strict(), annotations: todoWrite
  }, (input) => result(() => createTodo(ownerId, input, 'mcp')));
  server.registerTool('update_todo', {
    description: 'Update fields of your todo; set area/epic to move it. Use null to clear dueAt, hold, holdReason, scheduledAt, estimateMinutes.',
    inputSchema: z.object({ id: z.string().uuid(), area: name, ...todoFields, prefix }).partial().required({ id: true }).strict()
      .refine((input) => Object.keys(input).length > 1, 'No changes'), annotations: todoWrite
  }, ({ id, ...changes }) => result(() => updateTodo(ownerId, id, changes, 'mcp')));
  server.registerTool('complete_todo', {
    description: 'Mark your todo done. Completing a done todo changes nothing.',
    inputSchema: z.object({ id: z.string().uuid() }).strict(), annotations: { ...todoWrite, idempotentHint: true }
  }, ({ id }) => result(() => completeTodo(ownerId, id, 'mcp')));
  registerTodoResources(server, ownerId);
  return server;
}

// Read-only markdown for @-mentions (todo://today etc.). Dates shown in Asia/Seoul.
function registerTodoResources(server: McpServer, ownerId: string) {
  const views = [['today', '오늘 할 일'], ['overdue', '마감 지남'], ['waiting', '대기·막힘']] as const;
  for (const [key, title] of views) {
    server.registerResource(`todo-${key}`, `todo://${key}`, { title, mimeType: 'text/markdown' }, async (uri) => {
      const view = await todayView(ownerId);
      return markdown(uri, list(`${title} (${view.date})`, view[key]));
    });
  }
  const area = new ResourceTemplate('todo://area/{name}', {
    list: async () => ({ resources: (await listAreas(ownerId)).map((name) => ({ uri: `todo://area/${encodeURIComponent(name)}`, name: `todo-area-${name}`, title: `영역: ${name}`, mimeType: 'text/markdown' })) })
  });
  server.registerResource('todo-area', area, { title: '영역별 할 일', mimeType: 'text/markdown' }, async (uri, { name }) => {
    const value = decodeURIComponent(String(name));
    return markdown(uri, list(`영역: ${value}`, await listAreaTodos(ownerId, value)));
  });
  server.registerResource('todo-issue', new ResourceTemplate('todo://issue/{id}', { list: undefined }), { title: '할 일 상세', mimeType: 'text/markdown' }, async (uri, { id }) => {
    const todo = z.string().uuid().safeParse(id).success ? await getTodo(ownerId, String(id)).catch(() => undefined) : undefined;
    if (!todo) throw new Error('Todo not found');
    return markdown(uri, detail(todo));
  });
}

const kst = (value: string | null) => value && seoulDate(new Date(value));
function markdown(uri: URL, text: string) { return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }; }
function list(title: string, todos: Todo[]) { return `# ${title}\n\n${todos.length ? todos.map(line).join('\n') : '_없음_'}\n`; }
function line(todo: Todo) {
  const parts = [todo.priority.toUpperCase(), `${todo.area}/${todo.epic}`, todo.status, todo.dueAt && `마감 ${kst(todo.dueAt)}`, todo.scheduledAt && `예정 ${kst(todo.scheduledAt)}`, todo.hold && [todo.hold, todo.holdReason].filter(Boolean).join(': ')];
  return `- [${todo.status === 'done' ? 'x' : ' '}] ${todo.key ? `${todo.key}: ` : ''}${todo.title} — ${parts.filter(Boolean).join(' · ')} (id: ${todo.id})`;
}
function detail(todo: Todo) {
  const rows = [['키', todo.key], ['id', todo.id], ['영역', `${todo.area}/${todo.epic}`], ['상태', todo.status], ['우선순위', todo.priority.toUpperCase()], ['마감', kst(todo.dueAt)], ['예정', kst(todo.scheduledAt)], ['보류', todo.hold && [todo.hold, todo.holdReason].filter(Boolean).join(': ')], ['예상', todo.estimateMinutes && `${todo.estimateMinutes}분`], ['출처', todo.source]];
  return `# ${todo.title}\n\n${rows.filter(([, value]) => value).map(([label, value]) => `- ${label}: ${value}`).join('\n')}\n${todo.notes ? `\n## 메모\n\n${todo.notes}\n` : ''}`;
}

async function result(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await run()) }] };
  } catch (error) {
    const text = error instanceof NotFoundError ? 'Not found' : error instanceof AIConfigurationRequired ? 'AI configuration required' : 'Operation failed. Please try again.';
    return { isError: true, content: [{ type: 'text' as const, text }] };
  }
}
