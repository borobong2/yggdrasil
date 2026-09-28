import type { Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { SearchValidationError, searchWorkspace } from '../search.js';

export function registerSearchRoutes(app: Hono<AppEnv>): void {
  app.get('/api/search', ownerAuth, async (context) => {
    try {
      return context.json(await searchWorkspace(context.get('user').id, context.req.query('q') ?? ''));
    } catch (error) {
      if (error instanceof SearchValidationError) return context.json({ error: error.message }, 400);
      throw error;
    }
  });
}
