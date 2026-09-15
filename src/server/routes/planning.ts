import type { Hono } from 'hono';
import type { AppEnv } from '../auth.js';
import { ownerAuth } from '../auth.js';
import { planningTree } from '../planning.js';

export function registerPlanningRoutes(app: Hono<AppEnv>): void {
  app.use('/api/planning/*', ownerAuth);
  app.get('/api/planning/tree', async (c) => c.json(await planningTree(c.get('user').id)));
}
