import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, ownerAuth } from '../auth.js';
import { calendarView, completeTodo, completedAtInput, TodoValidationError, todayView, todoChanges, updateTodo } from '../todos.js';
import { bulkInput, bulkUpdateTodos } from '../todo-bulk.js';
import { NotFoundError } from '../work.js';

// UI todo writes: same validation as the MCP tools, logged with payload.via = 'ui'.
export function registerTodoRoutes(app: Hono<AppEnv>): void {
  app.use('/api/todos/*', ownerAuth);
  app.use('/api/calendar', ownerAuth);
  // YG-30: ?from=YYYY-MM-DD&to=YYYY-MM-DD (Asia/Seoul, inclusive, ≤ 62 days) &done=1 to include completed todos.
  app.get('/api/calendar', (c) => {
    const query = calendarQuery.safeParse(c.req.query());
    return query.success ? run(c, () => calendarView(c.get('user').id, query.data.from, query.data.to, query.data.done === '1')) : c.json({ error: 'Invalid range' }, 400);
  });
  app.get('/api/todos/today', (c) => run(c, () => todayView(c.get('user').id)));
  app.post('/api/todos/bulk', async (c) => {
    const input = bulkInput.safeParse(await c.req.json().catch(() => undefined));
    return input.success ? run(c, () => bulkUpdateTodos(c.get('user').id, input.data, 'ui')) : c.json({ error: 'Invalid bulk action' }, 400);
  });
  app.patch('/api/todos/:id', async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    const changes = todoChanges.safeParse(await c.req.json().catch(() => undefined));
    if (!id.success || !changes.success) return c.json({ error: 'Invalid todo' }, 400);
    return run(c, () => updateTodo(c.get('user').id, id.data, changes.data, 'ui'));
  });
  // Optional body { completedAt } (YG-37); no body completes now.
  app.post('/api/todos/:id/complete', async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    const body = completeBody.safeParse(await c.req.json().catch(() => ({})));
    return id.success && body.success ? run(c, () => completeTodo(c.get('user').id, id.data, 'ui', body.data.completedAt)) : c.json({ error: 'Invalid todo' }, 400);
  });
}

const completeBody = z.object({ completedAt: completedAtInput.optional() }).strict();
const calendarQuery = z.object({ from: z.iso.date(), to: z.iso.date(), done: z.enum(['0', '1']).optional() })
  .refine((range) => { const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000; return days >= 0 && days <= 62; }, 'from ≤ to, at most 62 days');

async function run(c: Context<AppEnv>, operation: () => Promise<unknown>) {
  try { return c.json(await operation()); }
  catch (error) {
    if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404);
    if (error instanceof TodoValidationError) return c.json({ error: error.message }, 400);
    throw error;
  }
}
