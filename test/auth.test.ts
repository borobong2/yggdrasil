import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AppEnv, ownerAuth } from '../src/server/auth.js';

const fixtureToken = 'Bearer test-owner-token';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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

  it('rejects the development owner override in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('YGGDRASIL_DEV_OWNER_ID', '00000000-0000-4000-8000-000000000003');
    const app = new Hono<AppEnv>();
    app.use('*', ownerAuth);
    app.get('/owner', (context) => context.json(context.get('user')));

    expect((await app.request('/owner')).status).toBe(401);
  });

  describe('email allowlist after Supabase verification', () => {
    const supabaseUser = (email: string) => vi.fn().mockResolvedValue(Response.json({ id: '00000000-0000-4000-8000-000000000009', email }));
    const ownerStatus = async (fetchMock: ReturnType<typeof vi.fn>) => {
      vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
      vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
      vi.stubGlobal('fetch', fetchMock);
      const app = new Hono<AppEnv>();
      app.use('*', ownerAuth);
      app.get('/owner', (context) => context.json(context.get('user')));
      return (await app.request('/owner', { headers: { authorization: 'Bearer supabase-access-token' } })).status;
    };

    it('allows a listed email case-insensitively in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', ' other@example.com , Owner@Example.com');
      const fetchMock = supabaseUser('owner@EXAMPLE.com');
      expect(await ownerStatus(fetchMock)).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/auth/v1/user', {
        headers: { apikey: 'test-anon-key', authorization: 'Bearer supabase-access-token' }
      });
    });

    it('rejects an email that is not listed', async () => {
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', 'owner@example.com');
      expect(await ownerStatus(supabaseUser('stranger@example.com'))).toBe(401);
    });

    it('denies everyone in production when the list is empty or missing', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', ' , ');
      expect(await ownerStatus(supabaseUser('owner@example.com'))).toBe(401);
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', undefined);
      expect(await ownerStatus(supabaseUser('owner@example.com'))).toBe(401);
    });

    it('allows any verified user outside production when the list is empty', async () => {
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', '');
      expect(await ownerStatus(supabaseUser('anyone@example.com'))).toBe(200);
    });

    it('rejects an invalid or expired Supabase token even for an allowed email', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', 'owner@example.com');
      expect(await ownerStatus(vi.fn().mockResolvedValue(Response.json({ msg: 'token is expired' }, { status: 403 })))).toBe(401);
    });
  });
});
