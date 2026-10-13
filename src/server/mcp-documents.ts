import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Document, IssueLink, Todo } from '../contracts/items.js';
import { appendActivity } from './activity.js';
import { getDb } from './db.js';
import { createDocument, DocumentValidationError, getDocument, linkIssue, listDocuments, listIssueDocuments, unlinkIssue, updateDocument } from './documents.js';
import { issues } from './schema.js';
import { NotFoundError } from './work.js';

// YG-33: document writes over MCP. Same service functions and limits as the 문서 tab (YG-23); bodies are markdown,
// mentions are `[@title](#issue-<id>)`. Every write logs an activity with payload.via = 'mcp'. No delete tool by design.
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const title = z.string().trim().min(1).max(200);
const body = z.string().max(100_000).describe("Markdown. Mention a todo with '[@title](#issue-<id>)'.");
const icon = z.string().regex(/^[^\s<>]{1,16}$/u).describe('Emoji icon');
const todoRef = z.string().trim().min(1).max(64).describe("Todo id (uuid) or ticket key like 'YG-24'");

export function registerDocumentTools(server: McpServer, ownerId: string): void {
  server.registerTool('create_document', {
    description: 'Create a markdown document page in your 문서 tab, optionally under a parent page and linked to todos.',
    inputSchema: z.object({ title, body: body.default(''), parentId: z.uuid().optional(), icon: icon.optional(), linkTodos: z.array(todoRef).max(20).optional() }).strict(), annotations: write
  }, (input) => result(async () => {
    const todoIds = await Promise.all((input.linkTodos ?? []).map((ref) => resolveTodo(ownerId, ref)));
    const doc = await createDocument(ownerId, input.title, input.body, input.parentId ?? null, input.icon ?? null);
    for (const issueId of new Set(todoIds)) await linkIssue(ownerId, doc.id, issueId);
    await log(ownerId, 'document.created', doc.id, { title: doc.title, linkedIssueIds: [...new Set(todoIds)] });
    return doc;
  }));
  server.registerTool('update_document', {
    description: 'Update your document. `body` replaces the whole markdown; `append` adds text at the end instead. parentId null moves it to the top level; icon null clears it.',
    inputSchema: z.object({ id: z.uuid(), title: title.optional(), body: body.optional(), append: z.string().min(1).max(100_000).optional(), parentId: z.uuid().nullable().optional(), icon: icon.nullable().optional() }).strict()
      .refine((input) => !(input.body !== undefined && input.append !== undefined), 'Use body or append, not both')
      .refine((input) => Object.keys(input).length > 1, 'No changes'), annotations: write
  }, ({ id, append, ...changes }) => result(async () => {
    if (append !== undefined) {
      const current = (await getDocument(ownerId, id)).body;
      changes.body = current ? `${current.replace(/\n*$/, '')}\n\n${append}` : append;
      if (changes.body.length > 100_000) throw new DocumentValidationError('Body would exceed 100000 characters');
    }
    const doc = await updateDocument(ownerId, id, changes);
    await log(ownerId, 'document.updated', id, { changes: [...Object.keys(changes), ...(append !== undefined ? ['append'] : [])] });
    return doc;
  }));
  server.registerTool('list_documents', {
    description: 'List your documents without bodies (use read_document for one). parentId filters to its children (null = top level); q matches title or body.',
    inputSchema: z.object({ parentId: z.uuid().nullable().optional(), q: z.string().trim().max(200).optional(), limit: z.number().int().min(1).max(200).default(50), includeArchived: z.boolean().default(false) }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, ({ parentId, q, limit, includeArchived }) => result(async () => {
    const docs = [...await listDocuments(ownerId), ...(includeArchived ? await listDocuments(ownerId, true) : [])];
    const needle = q?.toLocaleLowerCase();
    // ponytail: filters in memory over one owner's pages; push into SQL if a workspace grows past a few thousand docs.
    return docs.filter((doc) => (parentId === undefined || doc.parentId === parentId) && (!needle || `${doc.title}\n${doc.body}`.toLocaleLowerCase().includes(needle)))
      .slice(0, limit).map(({ id, title, icon, parentId, position, archivedAt, updatedAt }) => ({ id, title, icon, parentId, position, archivedAt, updatedAt }));
  }));
  const linkInput = z.object({ documentId: z.uuid(), todo: todoRef }).strict();
  server.registerTool('link_document_todo', {
    description: 'Link your document to your todo (by id or key like YG-24). Linking twice changes nothing.',
    inputSchema: linkInput, annotations: { ...write, idempotentHint: true }
  }, ({ documentId, todo }) => result(async () => {
    const issueId = await resolveTodo(ownerId, todo);
    const linked = await linkIssue(ownerId, documentId, issueId).then(() => true, (error) => { if (error instanceof DocumentValidationError) return false; throw error; });
    if (linked) await log(ownerId, 'document.linked', documentId, { issueId });
    return { documentId, issueId, linked: true };
  }));
  server.registerTool('unlink_document_todo', {
    description: 'Remove the link between your document and your todo (by id or key). Neither is deleted.',
    inputSchema: linkInput, annotations: { ...write, idempotentHint: true }
  }, ({ documentId, todo }) => result(async () => {
    const issueId = await resolveTodo(ownerId, todo);
    if (await unlinkIssue(ownerId, documentId, issueId)) await log(ownerId, 'document.unlinked', documentId, { issueId });
    return { documentId, issueId, linked: false };
  }));
}

/** Markdown appended to todo://issue/{id}: the todo's links and its linked documents. */
export async function todoResourceExtras(ownerId: string, todo: Todo): Promise<string> {
  const docs = await listIssueDocuments(ownerId, todo.id);
  return [
    todo.links.length && `\n## 링크\n\n${todo.links.map(linkLine).join('\n')}\n`,
    docs.length && `\n## 연결 문서\n\n${docs.map((doc: Document) => `- ${doc.icon ? `${doc.icon} ` : ''}${doc.title} (document id: ${doc.id})`).join('\n')}\n`
  ].filter(Boolean).join('');
}
function linkLine(link: IssueLink) {
  const target = link.url ?? (link.kind === 'doc' ? `document id: ${link.path}` : `\`${link.path}\``);
  return link.url ? `- [${link.kind}] [${link.label}](${target})` : `- [${link.kind}] ${link.label}: ${target}`;
}

// ponytail: own key lookup (todo key → id) so this module doesn't depend on concurrent todos.ts changes; fold into a shared helper later.
async function resolveTodo(ownerId: string, ref: string): Promise<string> {
  const byId = z.uuid().safeParse(ref).success;
  const row = (await getDb().select({ id: issues.id }).from(issues).where(and(eq(issues.ownerId, ownerId), byId ? eq(issues.id, ref) : eq(issues.key, ref.toUpperCase()))).limit(1))[0];
  if (!row) throw new NotFoundError();
  return row.id;
}

async function log(ownerId: string, kind: 'document.created' | 'document.updated' | 'document.linked' | 'document.unlinked', documentId: string, payload: Record<string, unknown>) {
  // ponytail: logged right after the service call, not in its transaction; the services own their writes (YG-23).
  await getDb().transaction((tx) => appendActivity(tx, ownerId, { kind, subjectType: 'document', subjectId: documentId, payload: { via: 'mcp', ...payload } }));
}

async function result(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await run()) }] };
  } catch (error) {
    const text = error instanceof NotFoundError ? 'Not found' : error instanceof DocumentValidationError ? error.message : 'Operation failed. Please try again.';
    return { isError: true, content: [{ type: 'text' as const, text }] };
  }
}
