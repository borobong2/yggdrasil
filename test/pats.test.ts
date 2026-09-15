import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

afterAll(() => pool.end());

it('returns a PAT plaintext once, stores only its hash, and revokes it owner-scoped', async () => {
  const create = await app.request('/api/pats', { method: 'POST', headers, body: JSON.stringify({ label: 'MCP' }) });
  expect(create.status).toBe(201);
  const issued = await create.json();
  expect(issued).toMatchObject({ label: 'MCP', revokedAt: null });
  expect(issued.token).toMatch(/^ygpat_/);

  const stored = await pool.query('SELECT token_hash FROM personal_access_tokens WHERE id = $1', [issued.id]);
  expect(stored.rows[0].token_hash).not.toBe(issued.token);

  const listed = await app.request('/api/pats', { headers });
  expect(listed.status).toBe(200);
  expect(await listed.json()).toContainEqual(expect.objectContaining({ id: issued.id, label: 'MCP' }));
  expect(JSON.stringify(await (await app.request('/api/pats', { headers })).json())).not.toContain(issued.token);

  expect((await app.request(`/api/pats/${issued.id}/revoke`, { method: 'POST', headers: other })).status).toBe(404);
  const revoke = await app.request(`/api/pats/${issued.id}/revoke`, { method: 'POST', headers });
  expect(revoke.status).toBe(200);
  expect(await revoke.json()).toMatchObject({ id: issued.id, revokedAt: expect.any(String) });
});

it('rejects invalid PAT input and IDs', async () => {
  expect((await app.request('/api/pats', { method: 'POST', headers, body: JSON.stringify({ label: '  ' }) })).status).toBe(400);
  expect((await app.request('/api/pats/not-a-uuid/revoke', { method: 'POST', headers })).status).toBe(400);
});
