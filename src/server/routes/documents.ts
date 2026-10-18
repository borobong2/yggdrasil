import type { Context, Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { archiveDocument, createDocument, DocumentValidationError, getDocument, linkIssue, listDocuments, listIssueDocuments, listIssueLinks, moveDocument, restoreDocument, updateDocument } from '../documents.js';
import { NotFoundError } from '../work.js';

type AppContext = Context<AppEnv>;

export function registerDocumentRoutes(app: Hono<AppEnv>): void {
  app.use('/api/documents/*', ownerAuth);
  app.post('/api/documents', async (c) => { const body = await bodyOf(c); const title = text(body.title); const content = body.body === undefined ? '' : bodyText(body.body); const parentId = body.parentId === undefined ? null : optionalUuid(body.parentId); const iconValue = body.icon === undefined ? null : icon(body.icon); const format = body.format === undefined ? 'markdown' : documentFormat(body.format); return !title || content === null || parentId === undefined || iconValue === undefined || format === undefined ? c.json({ error: 'Invalid document' }, 400) : execute(c, () => createDocument(c.get('user').id, title, content, parentId, iconValue, format), 201); });
  // ?issueId=<uuid> lists the live documents linked to that todo (YG-33 TodoDetail chips).
  app.get('/api/documents', (c) => {
    const issueId = c.req.query('issueId');
    if (issueId === undefined) return execute(c, () => listDocuments(c.get('user').id, c.req.query('archived') === 'true'), 200);
    const id = uuid(issueId);
    return id ? execute(c, () => listIssueDocuments(c.get('user').id, id), 200) : c.json({ error: 'Invalid ID' }, 400);
  });
  app.get('/api/documents/:id', (c) => byId(c, (id) => getDocument(c.get('user').id, id)));
  app.patch('/api/documents/:id', async (c) => {
    const body = await bodyOf(c); const id = uuid(c.req.param('id')); const title = body.title === undefined ? undefined : text(body.title); const bodyValue = body.body === undefined ? undefined : bodyText(body.body); const parentId = body.parentId === undefined ? undefined : optionalUuid(body.parentId); const iconValue = body.icon === undefined ? undefined : icon(body.icon); const format = body.format === undefined ? undefined : documentFormat(body.format);
    if (!id || body.title !== undefined && !title || body.body !== undefined && bodyValue === null || body.parentId !== undefined && parentId === undefined || body.icon !== undefined && iconValue === undefined || body.format !== undefined && format === undefined || body.title === undefined && body.body === undefined && body.parentId === undefined && body.icon === undefined && body.format === undefined) return c.json({ error: 'Invalid document' }, 400);
    return execute(c, () => updateDocument(c.get('user').id, id, { ...(title ? { title } : {}), ...(bodyValue !== undefined ? { body: bodyValue! } : {}), ...(parentId !== undefined ? { parentId } : {}), ...(iconValue !== undefined ? { icon: iconValue } : {}), ...(format !== undefined ? { format } : {}) }), 200);
  });
  app.post('/api/documents/:id/move', async (c) => {
    const id = uuid(c.req.param('id')); const body = await bodyOf(c); const parentId = optionalUuid(body.parentId); const index = body.index;
    return !id || parentId === undefined || !Number.isInteger(index) || (index as number) < 0 ? c.json({ error: 'Invalid move' }, 400) : execute(c, () => moveDocument(c.get('user').id, id, parentId, index as number), 200);
  });
  app.post('/api/documents/:id/archive', (c) => byId(c, (id) => archiveDocument(c.get('user').id, id)));
  app.post('/api/documents/:id/restore', (c) => byId(c, (id) => restoreDocument(c.get('user').id, id)));
  app.get('/api/documents/:id/issue-links', (c) => byId(c, (id) => listIssueLinks(c.get('user').id, id)));
  app.post('/api/documents/:id/issue-links', async (c) => { const id = uuid(c.req.param('id')); const issueId = uuid((await bodyOf(c)).issueId); return !id || !issueId ? c.json({ error: 'Invalid issue link' }, 400) : execute(c, () => linkIssue(c.get('user').id, id, issueId), 201); });
}

async function bodyOf(c: AppContext): Promise<Record<string, unknown>> { return c.req.json<Record<string, unknown>>().catch(() => ({})); }
async function byId(c: AppContext, operation: (id: string) => Promise<unknown>) { const id = uuid(c.req.param('id')); return !id ? c.json({ error: 'Invalid ID' }, 400) : execute(c, () => operation(id), 200); }
async function execute(c: AppContext, operation: () => Promise<unknown>, status: 200 | 201) { try { return c.json(await operation(), status); } catch (error) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); if (error instanceof DocumentValidationError) return c.json({ error: error.message }, 400); throw error; } }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() && value.trim().length <= 200 ? value.trim() : null; }
function bodyText(value: unknown): string | null { return typeof value === 'string' && value.length <= 100_000 ? value : null; }
function uuid(value: unknown): string | null { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
// Emoji icon: short, no whitespace or markup; `null` clears it.
function icon(value: unknown): string | null | undefined { return value === null ? null : typeof value === 'string' && /^[^\s<>]{1,16}$/u.test(value) ? value : undefined; }
function optionalUuid(value: unknown): string | null | undefined { return value === null ? null : uuid(value); }

function documentFormat(value: unknown): 'markdown' | 'html' | undefined { return value === 'markdown' || value === 'html' ? value : undefined; }
