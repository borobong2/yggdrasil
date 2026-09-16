import type { Context, Hono } from 'hono';
import type { IssueStatus } from '../../contracts/items.js';
import { type AppEnv, ownerAuth } from '../auth.js';
import { moveIssue } from '../board.js';
import { NotFoundError } from '../work.js';

const statuses: IssueStatus[] = ['backlog', 'todo', 'doing', 'done'];

export function registerBoardRoutes(app: Hono<AppEnv>): void {
  app.use('/api/issues/:id/move', ownerAuth);
  app.patch('/api/issues/:id/move', async (c) => {
    const id = uuid(c.req.param('id'));
    const body: Record<string, unknown> = await c.req.json<Record<string, unknown>>().catch(() => ({}));
    const status = typeof body.status === 'string' && statuses.includes(body.status as IssueStatus) ? body.status as IssueStatus : null;
    const position = typeof body.position === 'number' && Number.isInteger(body.position) && body.position >= 0 ? body.position : null;
    if (!id || !status || position === null) return c.json({ error: 'Invalid move' }, 400);
    try { return c.json(await moveIssue(c.get('user').id, id, status, position)); }
    catch (error) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); throw error; }
  });
}

function uuid(value: string): string | null { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
