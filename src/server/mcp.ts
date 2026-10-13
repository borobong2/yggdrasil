import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createCapture } from './captures.js';
import { DocumentValidationError, getDocument } from './documents.js';
import { registerDocumentTools } from './mcp-documents.js';
import { planningTree } from './planning.js';
import { searchWorkspace } from './search.js';
import { findDeliveryPlanCapture, generateDeliveryPlan } from './delivery-plans.js';
import { AIConfigurationRequired, generateOpenAIDeliveryPlan, type DeliveryPlanProvider } from './openai.js';
import { NotFoundError } from './work.js';
import { InvalidPrefixError } from './ticket-keys.js';
import { TodoValidationError } from './todos.js';
import { clip, registerTodoTools } from './mcp-todos.js';
import { registerHistoryTools } from './mcp-history.js';
import { registerReviewResources } from './mcp-review.js';

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
    description: 'Read your Goal → Epic → Issue hierarchy and progress. Archived todos are left out; notes are cut to 120 characters unless includeNotes.',
    inputSchema: z.object({ includeNotes: z.boolean().optional() }).strict().default({}), annotations: readOnly
  }, ({ includeNotes }) => result(async () => {
    const tree = await planningTree(ownerId);
    return includeNotes ? tree : tree.map((goal) => ({ ...goal, epics: goal.epics.map((epic) => ({ ...epic, issues: epic.issues.map((issue) => ({ ...issue, notes: clip(issue.notes) })) })) }));
  }));
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
  registerTodoTools(server, ownerId);
  registerDocumentTools(server, ownerId);
  registerHistoryTools(server, ownerId);
  registerReviewResources(server, ownerId);
  return server;
}

/** Tool result wrapper: JSON text, or a safe error message. Shared with the tool modules (mcp-todos.ts, mcp-documents.ts). */
export async function result(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await run()) }] };
  } catch (error) {
    const text = error instanceof NotFoundError ? 'Not found' : error instanceof AIConfigurationRequired ? 'AI configuration required'
      : error instanceof TodoValidationError || error instanceof DocumentValidationError ? error.message : error instanceof InvalidPrefixError ? 'Invalid prefix' : 'Operation failed. Please try again.';
    return { isError: true, content: [{ type: 'text' as const, text }] };
  }
}
