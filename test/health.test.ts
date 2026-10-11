import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/server/app.js';

describe('GET /api/health', () => {
  it('returns the health payload', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('GET /api/config', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns only the browser-safe Supabase values without auth', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'public-anon-key');
    vi.stubEnv('OPENAI_API_KEY', 'sk-secret');
    vi.stubEnv('DATABASE_URL', 'postgres://secret@db/x');
    vi.stubEnv('YGGDRASIL_ALLOWED_EMAILS', 'owner@example.com');

    const response = await app.request('/api/config');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-anon-key' });
    for (const secret of ['sk-secret', 'postgres://', 'owner@example.com']) expect(body).not.toContain(secret);
  });
});
