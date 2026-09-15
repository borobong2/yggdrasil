import type { Context, Hono } from 'hono';
import type { IssueStatus, Priority } from '../../contracts/items.js';
import { type AppEnv, ownerAuth } from '../auth.js';
import { createEpic, createGoal, createIssue, deleteEpic, deleteGoal, deleteIssue, getEpic, getGoal, getIssue, listEpics, listGoals, listIssues, NotFoundError, updateEpic, updateGoal, updateIssue } from '../work.js';

const statuses: IssueStatus[] = ['backlog', 'todo', 'doing', 'done'];
const priorities: Priority[] = ['low', 'medium', 'high'];
type AppContext = Context<AppEnv>;

export function registerWorkRoutes(app: Hono<AppEnv>): void {
  app.use('/api/goals/*', ownerAuth); app.use('/api/epics/*', ownerAuth); app.use('/api/issues/*', ownerAuth);
  app.post('/api/goals', async (c) => { const body = await bodyOf(c); const title = text(body.title); return !title ? c.json({ error: 'Invalid work item' }, 400) : execute(c, () => createGoal(c.get('user').id, title), 201); });
  app.get('/api/goals', async (c) => c.json(await listGoals(c.get('user').id)));
  app.get('/api/goals/:id', (c) => byId(c, (id) => getGoal(c.get('user').id, id)));
  app.patch('/api/goals/:id', async (c) => titleUpdate(c, (id, title) => updateGoal(c.get('user').id, id, title)));
  app.delete('/api/goals/:id', (c) => destroy(c, (id) => deleteGoal(c.get('user').id, id)));

  app.post('/api/epics', async (c) => { const body = await bodyOf(c); const title = text(body.title); const goalId = uuid(body.goalId); return !title || !goalId ? c.json({ error: 'Invalid work item' }, 400) : execute(c, () => createEpic(c.get('user').id, goalId, title), 201); });
  app.get('/api/epics', async (c) => c.json(await listEpics(c.get('user').id)));
  app.get('/api/epics/:id', (c) => byId(c, (id) => getEpic(c.get('user').id, id)));
  app.patch('/api/epics/:id', async (c) => titleUpdate(c, (id, title) => updateEpic(c.get('user').id, id, title)));
  app.delete('/api/epics/:id', (c) => destroy(c, (id) => deleteEpic(c.get('user').id, id)));

  app.post('/api/issues', async (c) => {
    const body = await bodyOf(c); const title = text(body.title); const epicId = uuid(body.epicId); const priority = body.priority === undefined ? 'medium' : choice(body.priority, priorities); const dueAt = date(body.dueAt);
    return !title || !epicId || !priority || dueAt === undefined ? c.json({ error: 'Invalid issue' }, 400) : execute(c, () => createIssue(c.get('user').id, epicId, title, priority, dueAt), 201);
  });
  app.get('/api/issues', async (c) => c.json(await listIssues(c.get('user').id)));
  app.get('/api/issues/:id', (c) => byId(c, (id) => getIssue(c.get('user').id, id)));
  app.patch('/api/issues/:id', async (c) => {
    const body = await bodyOf(c); const id = uuid(c.req.param('id')); const title = body.title === undefined ? undefined : text(body.title); const status = body.status === undefined ? undefined : choice(body.status, statuses); const priority = body.priority === undefined ? undefined : choice(body.priority, priorities); const dueAt = body.dueAt === undefined ? undefined : date(body.dueAt);
    if (!id || body.title !== undefined && !title || body.status !== undefined && !status || body.priority !== undefined && !priority || body.dueAt !== undefined && dueAt === undefined || body.title === undefined && body.status === undefined && body.priority === undefined && body.dueAt === undefined) return c.json({ error: 'Invalid issue' }, 400);
    return execute(c, () => updateIssue(c.get('user').id, id, { ...(title ? { title } : {}), ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(dueAt !== undefined ? { dueAt } : {}) }), 200);
  });
  app.delete('/api/issues/:id', (c) => destroy(c, (id) => deleteIssue(c.get('user').id, id)));
}

async function bodyOf(c: AppContext): Promise<Record<string, unknown>> { return c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>)); }
async function titleUpdate(c: AppContext, operation: (id: string, title: string) => Promise<unknown>) { const id = uuid(c.req.param('id')); const title = text((await bodyOf(c)).title); return !id || !title ? c.json({ error: 'Invalid work item' }, 400) : execute(c, () => operation(id, title), 200); }
async function byId(c: AppContext, operation: (id: string) => Promise<unknown>) { const id = uuid(c.req.param('id')); return !id ? c.json({ error: 'Invalid ID' }, 400) : execute(c, () => operation(id), 200); }
async function destroy(c: AppContext, operation: (id: string) => Promise<void>) { const id = uuid(c.req.param('id')); if (!id) return c.json({ error: 'Invalid ID' }, 400); try { await operation(id); return c.body(null, 204); } catch (error) { return failure(c, error); } }
async function execute(c: AppContext, operation: () => Promise<unknown>, status: 200 | 201) { try { return c.json(await operation(), status); } catch (error) { return failure(c, error); } }
function failure(c: AppContext, error: unknown) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); throw error; }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() && value.trim().length <= 200 ? value.trim() : null; }
function uuid(value: unknown): string | null { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null; }
function choice<T extends string>(input: unknown, allowed: T[]): T | null { return typeof input === 'string' && allowed.includes(input as T) ? input as T : null; }
function date(value: unknown): Date | null | undefined { if (value === undefined || value === null) return value; return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value) : undefined; }
