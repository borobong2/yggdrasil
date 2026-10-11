import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createCapture } from './captures.js';
import { getDocument } from './documents.js';
import { planningTree } from './planning.js';
import { searchWorkspace } from './search.js';
import { findDeliveryPlanCapture, generateDeliveryPlan } from './delivery-plans.js';
import { AIConfigurationRequired, generateOpenAIDeliveryPlan, type DeliveryPlanProvider } from './openai.js';
import { NotFoundError } from './work.js';
import { completeTodo, createTodo, updateTodo } from './todos.js';

const name = z.string().trim().min(1).max(200);
const day = z.union([z.iso.date(), z.iso.datetime({ offset: true })]).describe("'YYYY-MM-DD' (Asia/Seoul) or ISO timestamp");
const todoFields = {
  epic: name.describe("Group inside the area; defaults to '일반'"),
  title: name,
  status: z.enum(['backlog', 'todo', 'doing', 'done']),
  priority: z.enum(['p1', 'p2', 'p3', 'p4']),
  dueAt: day.nullable(),
  hold: z.enum(['waiting', 'blocked', 'scheduled']).nullable(),
  holdReason: z.string().trim().max(500).nullable(),
  scheduledAt: day.nullable(),
  notes: z.string().max(20_000),
  estimateMinutes: z.number().int().positive().max(100_000).nullable()
};

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
  server.registerTool('create_todo', {
    description: 'Create a todo in an area (커리어, 개인, 루틴, 잡일, 수익화, 부동산, 결혼, …). Missing area/epic are created. Defaults: status todo, priority p3.',
    inputSchema: z.object({ area: name, ...todoFields }).partial().required({ area: true, title: true }).strict(), annotations: todoWrite
  }, (input) => result(() => createTodo(ownerId, input, 'mcp')));
  server.registerTool('update_todo', {
    description: 'Update fields of your todo; set area/epic to move it. Use null to clear dueAt, hold, holdReason, scheduledAt, estimateMinutes.',
    inputSchema: z.object({ id: z.string().uuid(), area: name, ...todoFields }).partial().required({ id: true }).strict()
      .refine((input) => Object.keys(input).length > 1, 'No changes'), annotations: todoWrite
  }, ({ id, ...changes }) => result(() => updateTodo(ownerId, id, changes, 'mcp')));
  server.registerTool('complete_todo', {
    description: 'Mark your todo done. Completing a done todo changes nothing.',
    inputSchema: z.object({ id: z.string().uuid() }).strict(), annotations: { ...todoWrite, idempotentHint: true }
  }, ({ id }) => result(() => completeTodo(ownerId, id, 'mcp')));
  return server;
}

async function result(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await run()) }] };
  } catch (error) {
    const text = error instanceof NotFoundError ? 'Not found' : error instanceof AIConfigurationRequired ? 'AI configuration required' : 'Operation failed. Please try again.';
    return { isError: true, content: [{ type: 'text' as const, text }] };
  }
}
