import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

afterAll(() => pool.end());

async function issue() {
  const goal = await (await app.request('/api/goals', { method: 'POST', headers, body: JSON.stringify({ title: 'Evidence goal' }) })).json();
  const epic = await (await app.request('/api/epics', { method: 'POST', headers, body: JSON.stringify({ title: 'Evidence epic', goalId: goal.id }) })).json();
  return (await app.request('/api/issues', { method: 'POST', headers, body: JSON.stringify({ title: 'Evidence issue', epicId: epic.id }) })).json();
}

it('links, lists, and removes normalized issue evidence without changing issue status', async () => {
  const item = await issue();
  const before = await pool.query('SELECT status FROM issues WHERE id = $1', [item.id]);
  const beforeApi = await (await app.request(`/api/issues/${item.id}`, { headers })).json();
  const created = await app.request(`/api/issues/${item.id}/evidence`, {
    method: 'POST', headers, body: JSON.stringify({ url: 'https://github.com/openai/openai-node/pull/123/' })
  });

  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ issueId: item.id, url: 'https://github.com/openai/openai-node/pull/123', kind: 'github_pr', status: 'linked' });
  expect(await (await app.request(`/api/issues/${item.id}/evidence`, { headers })).json()).toHaveLength(1);
  const evidence = await (await app.request(`/api/issues/${item.id}/evidence`, { headers })).json();
  expect((await app.request(`/api/issues/${item.id}/evidence/${evidence[0].id}`, { method: 'DELETE', headers })).status).toBe(204);
  expect(await (await app.request(`/api/issues/${item.id}/evidence`, { headers })).json()).toEqual([]);
  expect(await pool.query('SELECT status FROM issues WHERE id = $1', [item.id])).toEqual(before);
  expect((await (await app.request(`/api/issues/${item.id}`, { headers })).json()).status).toBe(beforeApi.status);
});

it('rejects malformed URLs and evidence requests for another owner’s issue', async () => {
  const item = await issue();
  expect((await app.request(`/api/issues/${item.id}/evidence`, { method: 'POST', headers, body: JSON.stringify({ url: 'http://github.com/openai/openai-node/pull/123' }) })).status).toBe(400);
  expect((await app.request(`/api/issues/${item.id}/evidence`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://github.com/openai/openai-node/issues/123' }) })).status).toBe(400);
  expect((await app.request(`/api/issues/${item.id}/evidence`, { method: 'POST', headers: other, body: JSON.stringify({ url: 'https://example.com/deployments/123' }) })).status).toBe(404);
  expect((await app.request(`/api/issues/${item.id}/evidence`, { headers: other })).status).toBe(404);
});

it('rejects malformed evidence IDs and foreign-owner deletion', async () => {
  const item = await issue();
  const created = await app.request(`/api/issues/${item.id}/evidence`, { method: 'POST', headers, body: JSON.stringify({ url: 'https://preview.example.com/reviews/456' }) });
  const evidence = await created.json();
  expect((await app.request('/api/issues/not-a-uuid/evidence', { headers })).status).toBe(400);
  expect((await app.request(`/api/issues/${item.id}/evidence/not-a-uuid`, { method: 'DELETE', headers })).status).toBe(400);
  expect((await app.request(`/api/issues/${item.id}/evidence/${evidence.id}`, { method: 'DELETE', headers: other })).status).toBe(404);
  expect(await (await app.request(`/api/issues/${item.id}/evidence`, { headers })).json()).toHaveLength(1);
});

it('database rejects an evidence owner that does not own its issue', async () => {
  const item = await issue();
  await pool.query('BEGIN');
  try {
    await expect(pool.query("INSERT INTO issue_evidence (id, owner_id, issue_id, url, kind, status) VALUES ($1, $2, $3, $4, 'deployment', 'linked')", [crypto.randomUUID(), '00000000-0000-4000-8000-000000000002', item.id, 'https://preview.example.com/cross-owner'])).rejects.toThrow();
  } finally { await pool.query('ROLLBACK'); }
});

it('classifies GitHub commits and HTTPS deployments', async () => {
  const item = await issue();
  for (const [url, kind] of [['https://github.com/openai/openai-node/commit/a1b2c3d', 'github_commit'], ['https://preview.example.com/reviews/123', 'deployment']] as const) {
    const response = await app.request(`/api/issues/${item.id}/evidence`, { method: 'POST', headers, body: JSON.stringify({ url }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ url, kind, status: 'linked' });
  }
});
