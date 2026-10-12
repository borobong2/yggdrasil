import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, ownerAuth } from '../auth.js';
import { completeTodo, todayView, todoChanges, updateTodo } from '../todos.js';
import { bulkInput, bulkUpdateTodos } from '../todo-bulk.js';
import { NotFoundError } from '../work.js';

// UI todo writes: same validation as the MCP tools, logged with payload.via = 'ui'.
export function registerTodoRoutes(app: Hono<AppEnv>): void {
  app.use('/api/todos/*', ownerAuth);
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
  app.post('/api/todos/:id/complete', async (c) => {
    const id = z.uuid().safeParse(c.req.param('id'));
    return id.success ? run(c, () => completeTodo(c.get('user').id, id.data, 'ui')) : c.json({ error: 'Invalid todo' }, 400);
  });
}

async function run(c: Context<AppEnv>, operation: () => Promise<unknown>) {
  try { return c.json(await operation()); }
  catch (error) { if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404); throw error; }
}
