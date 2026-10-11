import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

it('enables RLS on every table in public, so new tables cannot skip it', async () => {
  const { rows } = await pool.query(
    "SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p') AND NOT relrowsecurity ORDER BY relname"
  );
  expect(rows.map((row) => row.relname)).toEqual([]);
});

it('denies a granted non-owner role (like Supabase anon) on reads and writes when no policy exists', async () => {
  const client = await pool.connect();
  try {
    // Everything, including the probe role, lives in one transaction and is rolled back.
    await client.query('BEGIN');
    await client.query("INSERT INTO captures (id, owner_id, text) VALUES ($1, $2, 'owner row')", [crypto.randomUUID(), crypto.randomUUID()]);
    await client.query('CREATE ROLE yg21_anon_probe NOLOGIN');
    await client.query('GRANT USAGE ON SCHEMA public TO yg21_anon_probe');
    await client.query('GRANT SELECT, INSERT ON captures TO yg21_anon_probe');
    await client.query('SET LOCAL ROLE yg21_anon_probe');
    expect((await client.query('SELECT count(*)::int AS n FROM captures')).rows[0].n).toBe(0);
    await client.query('SAVEPOINT probe_insert');
    await expect(client.query("INSERT INTO captures (id, owner_id, text) VALUES ($1, $2, 'anon row')", [crypto.randomUUID(), crypto.randomUUID()]))
      .rejects.toThrow(/row-level security/);
    await client.query('ROLLBACK TO SAVEPOINT probe_insert');
    await client.query('RESET ROLE');
    // The app connects as the table owner: a non-superuser owner still bypasses RLS (no FORCE).
    await client.query('CREATE ROLE yg21_owner_probe NOLOGIN');
    await client.query('ALTER TABLE captures OWNER TO yg21_owner_probe');
    await client.query('SET LOCAL ROLE yg21_owner_probe');
    expect((await client.query('SELECT count(*)::int AS n FROM captures')).rows[0].n).toBeGreaterThan(0);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  expect((await pool.query("SELECT 1 FROM pg_roles WHERE rolname LIKE 'yg21_%_probe'")).rowCount).toBe(0);
});
