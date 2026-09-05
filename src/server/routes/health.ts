import type { Hono } from 'hono';

export function registerHealthRoute(app: Hono): void {
  app.get('/api/health', (context) => context.json({ ok: true }));
}
