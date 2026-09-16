import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

afterAll(() => pool.end());

async function issue(title: string) {
  const goal = await (await app.request('/api/goals', { method: 'POST', headers, body: JSON.stringify({ title: `${title} goal` }) })).json();
  const epic = await (await app.request('/api/epics', { method: 'POST', headers, body: JSON.stringify({ title: `${title} epic`, goalId: goal.id }) })).json();
  return (await app.request('/api/issues', { method: 'POST', headers, body: JSON.stringify({ title, epicId: epic.id }) })).json();
}

it('reorders same-column siblings and records exactly one activity for the move', async () => {
  const first = await issue('First');
  const second = await issue('Second');
  const third = await issue('Third');

  const moved = await app.request(`/api/issues/${third.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'backlog', position: 0 }) });

  expect(moved.status).toBe(200);
  expect(await moved.json()).toMatchObject({ id: third.id, status: 'backlog', position: 0 });
  expect((await pool.query('SELECT id FROM issues WHERE id = ANY($1::uuid[]) ORDER BY position', [[first.id, second.id, third.id]])).rows.map((item) => item.id)).toEqual([third.id, first.id, second.id]);
  expect((await pool.query("SELECT kind, subject_id FROM activities WHERE subject_id = $1", [third.id])).rows).toEqual([{ kind: 'issue.moved', subject_id: third.id }]);
});

it('moves an issue between backlog and board columns at the requested position', async () => {
  const first = await issue('Todo first');
  const second = await issue('Todo second');
  const third = await issue('Todo third');

  await app.request(`/api/issues/${first.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'todo', position: 0 }) });
  await app.request(`/api/issues/${third.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'todo', position: 1 }) });
  const moved = await app.request(`/api/issues/${second.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'todo', position: 1 }) });

  expect(moved.status).toBe(200);
  expect((await pool.query("SELECT id FROM issues WHERE id = ANY($1::uuid[]) AND status = 'todo' ORDER BY position", [[first.id, second.id, third.id]])).rows.map((item) => item.id)).toEqual([first.id, second.id, third.id]);
});

it('hides another owner’s issue and writes no activity', async () => {
  const item = await issue('Private board item');

  expect((await app.request(`/api/issues/${item.id}/move`, { method: 'PATCH', headers: other, body: JSON.stringify({ status: 'doing', position: 0 }) })).status).toBe(404);
  expect((await pool.query('SELECT count(*)::int AS count FROM activities WHERE subject_id = $1', [item.id])).rows[0].count).toBe(0);
});
