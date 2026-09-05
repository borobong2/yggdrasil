import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppEnv, ownerAuth } from '../src/server/auth.js';

const fixtureToken = 'Bearer test-owner-token';

afterEach(() => vi.unstubAllGlobals());

describe('owner auth boundary', () => {
  it('allows only the test owner fixture in test setup', async () => {
    const app = new Hono<AppEnv>();
    app.use('*', ownerAuth);
    app.get('/owner', (context) => context.json(context.get('user')));

    const response = await app.request('/owner', { headers: { authorization: fixtureToken } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: '00000000-0000-4000-8000-000000000001' });
  });

  it('rejects missing and invalid bearer tokens through the production path', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const app = new Hono<AppEnv>();
    app.use('*', ownerAuth);
    app.get('/owner', (context) => context.json(context.get('user')));

    expect((await app.request('/owner')).status).toBe(401);
    expect((await app.request('/owner', { headers: { authorization: 'Bearer invalid' } })).status).toBe(401);
  });
});
