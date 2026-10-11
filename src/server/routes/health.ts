import type { Hono } from 'hono';
import type { AppEnv } from '../auth.js';

export function registerHealthRoute(app: Hono<AppEnv>): void {
  app.get('/api/health', (context) => context.json({ ok: true }));
  // Public: only browser-safe Supabase values (the anon key is designed to be shipped to browsers).
  app.get('/api/config', (context) => context.json({
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? ''
  }));
}
