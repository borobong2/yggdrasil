import { expect, it } from 'vitest';
import pg from 'pg';
import { checkDatabaseUrl } from '../src/server/database-url.js';
import { getDb } from '../src/server/db.js';

it('reuses one database client per process', () => {
  expect(getDb()).toBe(getDb());
});

it('takes SSL from DATABASE_URL: local stays plain, Supabase must say sslmode', () => {
  const ssl = (url: string) => (new pg.Client({ connectionString: checkDatabaseUrl(url) }) as unknown as { ssl: unknown }).ssl;
  expect(ssl('postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil')).toBe(false);
  const pooler = 'postgres://postgres.ref:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres';
  expect(() => checkDatabaseUrl(pooler)).toThrow(/sslmode/);
  // libpq "require": encrypted, CA not checked (Supabase signs with its own CA). Pins pg's semantics against upgrades.
  expect(ssl(`${pooler}?sslmode=require&uselibpqcompat=true`)).toEqual({ rejectUnauthorized: false });
});
