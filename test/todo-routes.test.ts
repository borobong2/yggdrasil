import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { createTodo } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = '00000000-0000-4000-8000-000000000001';
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };
afterAll(() => pool.end());

const patch = (id: string, body: unknown, as = headers) => app.request(`/api/todos/${id}`, { method: 'PATCH', headers: as, body: JSON.stringify(body) });
const activities = async (id: string) => (await pool.query('SELECT kind, payload FROM activities WHERE subject_id = $1 ORDER BY created_at, id', [id])).rows;

it('updates detail fields of the owner’s todo and logs via=ui', async () => {
  const todo = await createTodo(owner, { area: `보드 ${crypto.randomUUID()}`, title: '상세 수정' });
  const response = await patch(todo.id, { title: '  새 제목 ', priority: 'p1', hold: 'blocked', holdReason: '리뷰 대기', dueAt: '2026-10-20', scheduledAt: null, notes: '메모', estimateMinutes: 45 });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: todo.id, title: '새 제목', priority: 'p1', hold: 'blocked', holdReason: '리뷰 대기', dueAt: '2026-10-19T15:00:00.000Z', notes: '메모', estimateMinutes: 45, area: todo.area });
  expect((await activities(todo.id)).at(-1)).toMatchObject({ kind: 'issue.updated', payload: { via: 'ui', changes: expect.arrayContaining(['title', 'priority', 'hold']) } });
});

it('rejects invalid input without writing', async () => {
  const todo = await createTodo(owner, { area: `보드 ${crypto.randomUUID()}`, title: '검증' });
  for (const body of [{}, { title: '' }, { priority: 'p9' }, { hold: 'later' }, { dueAt: 'tomorrow' }, { estimateMinutes: -5 }, { estimateMinutes: 1.5 }, { unknown: 1 }, 'text'])
    expect((await patch(todo.id, body)).status, JSON.stringify(body)).toBe(400);
  expect((await patch('not-a-uuid', { title: 'x' })).status).toBe(400);
  expect(await activities(todo.id)).toHaveLength(1); // only issue.created
});

it('hides another owner’s todo from update and complete', async () => {
  const todo = await createTodo(owner, { area: `보드 ${crypto.randomUUID()}`, title: '비공개' });
  expect((await patch(todo.id, { title: '탈취' }, other)).status).toBe(404);
  expect((await app.request(`/api/todos/${todo.id}/complete`, { method: 'POST', headers: other })).status).toBe(404);
  expect((await pool.query('SELECT title, status FROM issues WHERE id = $1', [todo.id])).rows[0]).toEqual({ title: '비공개', status: 'todo' });
  expect(await activities(todo.id)).toHaveLength(1);
});

it('completes once with via=ui, placing the todo on top of the done column', async () => {
  const area = `보드 ${crypto.randomUUID()}`;
  const earlier = await createTodo(owner, { area, title: '먼저 완료', status: 'done' });
  const todo = await createTodo(owner, { area, title: '완료 처리' });
  const complete = () => app.request(`/api/todos/${todo.id}/complete`, { method: 'POST', headers });
  const done = await (await complete()).json();
  expect(done).toMatchObject({ status: 'done' });
  expect(done.position).toBeLessThan(earlier.position);
  expect((await complete()).status).toBe(200);
  expect((await activities(todo.id)).map((row) => [row.kind, row.payload.via])).toEqual([['issue.created', 'ui'], ['issue.completed', 'ui']]);
});

it('persists a board move so a reload returns the new order', async () => {
  const area = `보드 ${crypto.randomUUID()}`;
  const [a, b] = [await createTodo(owner, { area, title: 'A', status: 'doing' }), await createTodo(owner, { area, title: 'B', status: 'doing' })];
  expect((await app.request(`/api/issues/${b.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'doing', position: 0 }) })).status).toBe(200);
  const doing = (await (await app.request('/api/issues', { headers })).json()).filter((issue: { status: string }) => issue.status === 'doing').map((issue: { id: string }) => issue.id);
  expect(doing.indexOf(b.id)).toBe(0);
  expect(doing.indexOf(b.id)).toBeLessThan(doing.indexOf(a.id));
  expect((await activities(b.id)).at(-1)).toMatchObject({ kind: 'issue.moved', payload: { from: 'doing', to: 'doing', position: 0 } });
});

it('returns validation paths without changing the todo', async () => {
  const todo = await createTodo(owner, { area: `오류 ${crypto.randomUUID()}`, title: '유지' });
  const response = await patch(todo.id, { title: ' ', estimateMinutes: 1.5, recurrence: { freq: 'weekly', weekdays: [] } });
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: ['title'], message: expect.any(String) }),
    expect.objectContaining({ path: ['estimateMinutes'], message: expect.any(String) }),
    expect.objectContaining({ path: ['recurrence', 'weekdays'], message: expect.any(String) })
  ]));
  expect(await activities(todo.id)).toHaveLength(1);
});
it.each([
  [{ recurrence: { freq: 'monthly', monthDay: 32 } }, ['recurrence', 'monthDay']],
  [{ recurrence: { freq: 'weekly' } }, ['recurrence', 'weekdays']],
  [{ actualMinutes: 0 }, ['actualMinutes']]
])('identifies the rejected recurrence or duration field (%j)', async (body, path) => {
  const response = await patch('00000000-0000-4000-8000-000000000003', body);
  expect(response.status).toBe(400);
  expect((await response.json()).issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
});
