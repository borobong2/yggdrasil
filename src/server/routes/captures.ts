import type { Hono } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { createCapture, listCaptures } from '../captures.js';

export function registerCaptureRoutes(app: Hono<AppEnv>): void {
  app.use('/api/captures/*', ownerAuth);

  app.post('/api/captures', async (context) => {
    const body: { text?: unknown } = await context.req.json<{ text?: unknown }>().catch(() => ({}));
    if (typeof body.text !== 'string' || !body.text.trim()) return context.json({ error: 'Text is required' }, 400);
    return context.json(await createCapture(context.get('user').id, body.text.trim()), 201);
  });

  app.get('/api/captures', async (context) => context.json(await listCaptures(context.get('user').id)));
}
