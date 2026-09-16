import type { Context, Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { acceptDeliveryPlan, dismissDeliveryPlan, PlanConflictError, PlanNotFoundError, PlanValidationError } from '../plan-acceptance.js';

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function registerPlanAcceptanceRoutes(app: Hono<AppEnv>): void {
  app.use('/api/delivery-plan-proposals/*', ownerAuth);
  app.post('/api/delivery-plan-proposals/:id/accept', (c) => run(c, acceptDeliveryPlan, 201));
  app.post('/api/delivery-plan-proposals/:id/dismiss', (c) => run(c, dismissDeliveryPlan, 200));
}

async function run(c: Context<AppEnv>, operation: (ownerId: string, proposalId: string) => Promise<unknown>, status: 200 | 201) {
  const id = c.req.param('id') ?? '';
  if (!isUuid(id)) return c.json({ error: 'Invalid proposal ID' }, 400);
  try { return c.json(await operation(c.get('user').id, id), status); }
  catch (error) {
    if (error instanceof PlanNotFoundError) return c.json({ error: 'Proposal not found' }, 404);
    if (error instanceof PlanConflictError) return c.json({ error: 'Proposal is not pending' }, 409);
    if (error instanceof PlanValidationError) return c.json({ error: 'Invalid delivery plan' }, 422);
    throw error;
  }
}
