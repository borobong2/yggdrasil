import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { installTestOwner } from '../src/server/auth.js';
import { app } from '../src/server/app.js';
import { createCapture } from '../src/server/captures.js';
import { createDocument } from '../src/server/documents.js';
import { createGoal, createEpic, createIssue } from '../src/server/work.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = '00000000-0000-4000-8000-000000008001';
const other = '00000000-0000-4000-8000-000000008002';
installTestOwner('yg08-owner-token', { id: owner });
installTestOwner('yg08-owner-two-token', { id: other });
const headers = { authorization: 'Bearer yg08-owner-token' };
afterAll(() => pool.end());
const search = (q: string, authorization = headers.authorization) => app.request(`/api/search?q=${encodeURIComponent(q)}`, { headers: { authorization } });

it('searches all five kinds and document body case-insensitively without leaking another owner', async () => {
  const q = `yg08-${crypto.randomUUID()}`;
  const doc = await createDocument(owner, 'body match', q.toUpperCase(), null);
  const goal = await createGoal(owner, q);
  const epic = await createEpic(owner, goal.id, q);
  const issue = await createIssue(owner, epic.id, q, 'medium', null);
  const capture = await createCapture(owner, q);
  await createCapture(other, q);
  await createDocument(other, q, q, null);
  const response = await search(q);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: 'document', id: doc.id }), expect.objectContaining({ kind: 'goal', id: goal.id }),
    expect.objectContaining({ kind: 'epic', id: epic.id }), expect.objectContaining({ kind: 'issue', id: issue.id }),
    expect.objectContaining({ kind: 'capture', id: capture.id })
  ]));
  expect((await (await search(q)).json())).toHaveLength(5);
  expect(await (await search(q, 'Bearer yg08-owner-two-token')).json()).toHaveLength(2);
});

it('validates and caps search, treating SQL wildcard and injection input as literal text', async () => {
  expect((await search('x', 'Bearer invalid')).status).toBe(401);
  expect(await (await search('  ')).json()).toEqual([]);
  expect((await search('x'.repeat(201))).status).toBe(400);
  const q = `literal-${crypto.randomUUID()}`;
  await createCapture(owner, `${q}%_\\' OR 1=1 --`);
  await createCapture(owner, `${q}other`);
  expect(await (await search(`${q}%_\\' OR 1=1 --`)).json()).toHaveLength(1);
  const cap = `cap-${crypto.randomUUID()}`;
  await pool.query("INSERT INTO captures (id, owner_id, text) SELECT gen_random_uuid(), $1, $2 || repeat('x', 300) FROM generate_series(1, 60)", [owner, cap]);
  const rows = await (await search(cap)).json();
  expect(rows).toHaveLength(50);
  expect(rows.every((row: { title: string; preview: string }) => row.title.length <= 200 && row.preview.length <= 200)).toBe(true);
  expect(await (await search(cap)).json()).toEqual(rows);
});
