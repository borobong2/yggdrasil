import type { Hono } from 'hono';
import type { AppEnv } from '../auth.js';
import { AIConfigurationRequired, generateOpenAIDeliveryPlan, type DeliveryPlanProvider } from '../openai.js';
import { findDeliveryPlanCapture, generateDeliveryPlan, listDeliveryPlans } from '../delivery-plans.js';

export function registerDeliveryPlanRoutes(app: Hono<AppEnv>, provider: DeliveryPlanProvider = generateOpenAIDeliveryPlan): void {
  app.on(['GET', 'POST'], '/api/captures/:id/delivery-plan', async (context) => {
    const id = context.req.param('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return context.json({ error: 'Invalid capture ID' }, 400);
    const ownerId = context.get('user').id;
    const capture = await findDeliveryPlanCapture(ownerId, id);
    if (!capture) return context.json({ error: 'Capture not found' }, 404);
    if (context.req.method === 'GET') return context.json(await listDeliveryPlans(ownerId, id));
    try {
      return context.json(await generateDeliveryPlan(ownerId, capture, provider), 201);
    } catch (error) {
      if (error instanceof AIConfigurationRequired) return context.json({ error: 'AI configuration required: set OPENAI_API_KEY on the server.' }, 503);
      return context.json({ error: 'Delivery plan generation failed. Please try again.' }, 502);
    }
  });
}
