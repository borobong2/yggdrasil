import type { Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, ownerAuth } from '../auth.js';
import { weekReview } from '../review.js';

// YG-43: GET /api/review/week?start=YYYY-MM-DD — the Asia/Seoul Mon–Sun week containing that day (default: this week).
export function registerReviewRoutes(app: Hono<AppEnv>): void {
  app.get('/api/review/week', ownerAuth, async (c) => {
    const start = z.iso.date().optional().safeParse(c.req.query('start'));
    return start.success ? c.json(await weekReview(c.get('user').id, start.data)) : c.json({ error: 'Invalid week' }, 400);
  });
}
