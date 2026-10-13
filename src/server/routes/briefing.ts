import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { type AppEnv, ownerAuth } from '../auth.js';
import { briefingOwner, BriefingSendError, getBriefingSettings, missingConfig, runBriefing, secretMatches, SEND_TIME, updateBriefingSettings } from '../briefing.js';

const settingsInput = z.object({ enabled: z.boolean(), sendTime: z.string().regex(SEND_TIME) }).partial().strict();

// YG-29. Settings and the test send use the owner session; /run is public and authenticated by BRIEFING_SECRET (Cloud Scheduler header).
export function registerBriefingRoutes(app: Hono<AppEnv>): void {
  app.use('/api/briefing/settings', ownerAuth);
  app.use('/api/briefing/test', ownerAuth);
  app.get('/api/briefing/settings', async (c) => c.json(await getBriefingSettings(c.get('user').id)));
  app.put('/api/briefing/settings', async (c) => {
    const input = settingsInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'Invalid settings' }, 400);
    return c.json(await updateBriefingSettings(c.get('user').id, input.data));
  });
  app.post('/api/briefing/test', async (c) => {
    const missing = missingConfig();
    if (missing.length) return notConfigured(c, missing);
    if (briefingOwner() !== c.get('user').id) return c.json({ error: 'Only the briefing owner (BRIEFING_OWNER_ID) can send a test' }, 403);
    return send(c, () => runBriefing(c.get('user').id, { force: true }));
  });

  // Public: every 30 min from Cloud Scheduler. ?force=1 sends regardless of time/enabled/already-sent (manual test with the secret).
  app.post('/api/briefing/run', async (c) => {
    const secret = process.env.BRIEFING_SECRET?.trim();
    if (!secret) return notConfigured(c, ['BRIEFING_SECRET']);
    if (!secretMatches(secret, c.req.header('x-briefing-secret'))) return c.json({ error: 'Unauthorized' }, 401);
    const missing = missingConfig();
    if (missing.length) return notConfigured(c, missing);
    return send(c, () => runBriefing(briefingOwner(), { force: c.req.query('force') === '1' }));
  });
}

function notConfigured(c: Context<AppEnv>, missing: string[]) {
  return c.json({ error: `Morning briefing is not configured: set ${missing.join(', ')}`, missing }, 503);
}

async function send(c: Context<AppEnv>, run: () => Promise<unknown>) {
  try { return c.json(await run()); } catch (error) {
    if (error instanceof BriefingSendError) return c.json({ error: error.message }, 502);
    throw error;
  }
}
