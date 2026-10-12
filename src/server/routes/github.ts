import type { Context, Hono, MiddlewareHandler } from 'hono';
import { type AppEnv, ownerAuth } from '../auth.js';
import { BlockedRepoError, connectRepo, disconnectRepo, handleGitHubEvent, InvalidRepoError, listRepos, verifySignature } from '../github.js';
import { authenticatePat } from '../pats.js';
import { NotFoundError } from '../work.js';

type AppContext = Context<AppEnv>;

// Repo management also accepts a PAT so scripts/connect-repo.sh can register a repo without a browser session.
const ownerOrPat: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = c.req.header('authorization')?.match(/^Bearer (ygpat_.+)$/)?.[1];
  if (!token) return ownerAuth(c, next);
  const owner = await authenticatePat(token);
  if (!owner) return c.json({ error: 'Unauthorized' }, 401);
  c.set('user', owner);
  await next();
};

export function registerGitHubRoutes(app: Hono<AppEnv>): void {
  app.use('/api/github/repos', ownerOrPat);
  app.use('/api/github/repos/*', ownerOrPat);
  app.get('/api/github/repos', async (c) => c.json(await listRepos(c.get('user').id)));
  app.post('/api/github/repos', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
    try { return c.json(await connectRepo(c.get('user').id, body.fullName, body.prefix, body.start), 201); } catch (error) { return failure(c, error); }
  });
  app.delete('/api/github/repos/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return c.json({ error: 'Invalid ID' }, 400);
    try { await disconnectRepo(c.get('user').id, id); return c.body(null, 204); } catch (error) { return failure(c, error); }
  });

  // Public: GitHub authenticates with the shared-secret HMAC, not a user session.
  app.post('/api/webhooks/github', async (c) => {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) return c.json({ error: 'GitHub webhook is not configured' }, 503);
    const body = await c.req.text();
    if (!verifySignature(secret, body, c.req.header('x-hub-signature-256'))) return c.json({ error: 'Invalid signature' }, 401);
    const event = c.req.header('x-github-event');
    const delivery = c.req.header('x-github-delivery');
    if (!event || !delivery || delivery.length > 100) return c.json({ error: 'Missing GitHub headers' }, 400);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return c.json({ error: 'Invalid JSON' }, 400); }
    if (!payload || typeof payload !== 'object') return c.json({ error: 'Invalid JSON' }, 400);
    return c.json(await handleGitHubEvent(event, delivery, payload as Record<string, unknown>));
  });
}

function failure(c: AppContext, error: unknown) {
  if (error instanceof BlockedRepoError) return c.json({ error: 'Company repositories cannot be connected' }, 403);
  if (error instanceof InvalidRepoError) return c.json({ error: 'Invalid repository' }, 400);
  if (error instanceof NotFoundError) return c.json({ error: 'Not found' }, 404);
  throw error;
}
