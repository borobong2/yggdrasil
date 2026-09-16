import type { Context, Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { createEvidence, deleteEvidence, InvalidEvidenceError, listEvidence } from '../evidence.js';
import { NotFoundError } from '../work.js';

type AppContext = Context<AppEnv>;

export function registerEvidenceRoutes(app: Hono<AppEnv>): void {
  app.use('/api/issues/:issueId/evidence', ownerAuth);
  app.use('/api/issues/:issueId/evidence/*', ownerAuth);
  app.post('/api/issues/:issueId/evidence', async (c) => { const issueId = uuid(c.req.param('issueId')); if (!issueId) return c.json({ error: 'Invalid ID' }, 400); const value = (await body(c)).url; return execute(c, () => createEvidence(c.get('user').id, issueId, value), 201); });
  app.get('/api/issues/:issueId/evidence', (c) => { const issueId = uuid(c.req.param('issueId')); return !issueId ? c.json({ error: 'Invalid ID' }, 400) : execute(c, () => listEvidence(c.get('user').id, issueId), 200); });
  app.delete('/api/issues/:issueId/evidence/:id', async (c) => {
    const issueId = uuid(c.req.param('issueId')); const id = uuid(c.req.param('id'));
    if (!issueId || !id) return c.json({ error: 'Invalid ID' }, 400);
    try { await deleteEvidence(c.get('user').id, issueId, id); return c.body(null, 204); }
    catch (error) { return failure(c, error); }
  });
}

async function body(c: AppContext): Promise<Record<string, unknown>> { return c.req.json<Record<string, unknown>>().catch(() => ({})); }
async function execute(c: AppContext, operation: () => Promise<unknown>, status: 200 | 201) { try { return c.json(await operation(), status); } catch (error) { return failure(c, error); } }
function failure(c: AppContext, error: unknown) { if (error instanceof InvalidEvidenceError) return c.json({ error: 'Invalid evidence URL' }, 400); if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); throw error; }
function uuid(value: string): string | null { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
