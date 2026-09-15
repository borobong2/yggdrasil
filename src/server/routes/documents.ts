import type { Context, Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { createDocument, DocumentValidationError, getDocument, linkIssue, listDocuments, listIssueLinks, updateDocument } from '../documents.js';
import { NotFoundError } from '../work.js';

type AppContext = Context<AppEnv>;

export function registerDocumentRoutes(app: Hono<AppEnv>): void {
  app.use('/api/documents/*', ownerAuth);
  app.post('/api/documents', async (c) => { const body = await bodyOf(c); const title = text(body.title); const content = body.body === undefined ? '' : bodyText(body.body); const parentId = optionalUuid(body.parentId); return !title || content === null || parentId === undefined ? c.json({ error: 'Invalid document' }, 400) : execute(c, () => createDocument(c.get('user').id, title, content, parentId), 201); });
  app.get('/api/documents', (c) => execute(c, () => listDocuments(c.get('user').id), 200));
  app.get('/api/documents/:id', (c) => byId(c, (id) => getDocument(c.get('user').id, id)));
  app.patch('/api/documents/:id', async (c) => {
    const body = await bodyOf(c); const id = uuid(c.req.param('id')); const title = body.title === undefined ? undefined : text(body.title); const bodyValue = body.body === undefined ? undefined : bodyText(body.body); const parentId = body.parentId === undefined ? undefined : optionalUuid(body.parentId);
    if (!id || body.title !== undefined && !title || body.body !== undefined && bodyValue === null || body.parentId !== undefined && parentId === undefined || body.title === undefined && body.body === undefined && body.parentId === undefined) return c.json({ error: 'Invalid document' }, 400);
    return execute(c, () => updateDocument(c.get('user').id, id, { ...(title ? { title } : {}), ...(bodyValue !== undefined ? { body: bodyValue! } : {}), ...(parentId !== undefined ? { parentId } : {}) }), 200);
  });
  app.get('/api/documents/:id/issue-links', (c) => byId(c, (id) => listIssueLinks(c.get('user').id, id)));
  app.post('/api/documents/:id/issue-links', async (c) => { const id = uuid(c.req.param('id')); const issueId = uuid((await bodyOf(c)).issueId); return !id || !issueId ? c.json({ error: 'Invalid issue link' }, 400) : execute(c, () => linkIssue(c.get('user').id, id, issueId), 201); });
}

async function bodyOf(c: AppContext): Promise<Record<string, unknown>> { return c.req.json<Record<string, unknown>>().catch(() => ({})); }
async function byId(c: AppContext, operation: (id: string) => Promise<unknown>) { const id = uuid(c.req.param('id')); return !id ? c.json({ error: 'Invalid ID' }, 400) : execute(c, () => operation(id), 200); }
async function execute(c: AppContext, operation: () => Promise<unknown>, status: 200 | 201) { try { return c.json(await operation(), status); } catch (error) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); if (error instanceof DocumentValidationError) return c.json({ error: error.message }, 400); throw error; } }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() && value.trim().length <= 200 ? value.trim() : null; }
function bodyText(value: unknown): string | null { return typeof value === 'string' && value.length <= 100_000 ? value : null; }
function uuid(value: unknown): string | null { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
function optionalUuid(value: unknown): string | null | undefined { return value === null ? null : uuid(value); }
