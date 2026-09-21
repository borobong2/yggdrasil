import type { Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { listActivities } from '../activity.js';

export function registerActivityRoutes(app: Hono<AppEnv>): void {
  app.get('/api/activities', ownerAuth, async (context) => context.json(await listActivities(context.get('user').id)));
}
