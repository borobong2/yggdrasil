import type { Hono } from 'hono';
import type { AppEnv } from '../auth.js';

export function registerHealthRoute(app: Hono<AppEnv>): void {
  app.get('/api/health', (context) => context.json({ ok: true }));
}
