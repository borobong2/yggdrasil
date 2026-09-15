import type { Context, Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { issuePat, listPats, revokePat } from '../pats.js';
import { NotFoundError } from '../work.js';

type AppContext = Context<AppEnv>;

export function registerPatRoutes(app: Hono<AppEnv>): void {
  app.use('/api/pats/*', ownerAuth);
  app.get('/api/pats', async (c) => c.json(await listPats(c.get('user').id)));
  app.post('/api/pats', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    const label = typeof body.label === 'string' ? body.label.trim() : '';
    return !label || label.length > 100 ? c.json({ error: 'Invalid label' }, 400) : c.json(await issuePat(c.get('user').id, label), 201);
  });
  app.post('/api/pats/:id/revoke', async (c) => {
    const id = uuid(c.req.param('id'));
    if (!id) return c.json({ error: 'Invalid ID' }, 400);
    try { return c.json(await revokePat(c.get('user').id, id)); } catch (error) { return failure(c, error); }
  });
}

function failure(c: AppContext, error: unknown) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); throw error; }
function uuid(value: string): string | null { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
