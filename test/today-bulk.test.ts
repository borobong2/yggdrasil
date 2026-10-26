import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { createTodo } from '../src/server/todos.js';

// YG-25 GET /api/todos/today and YG-26 POST /api/todos/bulk.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = '00000000-0000-4000-8000-000000000001';
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });

const bulk = (body: unknown, as = headers) => app.request('/api/todos/bulk', { method: 'POST', headers: as, body: JSON.stringify(body) });
const row = async (id: string) => (await pool.query('SELECT status, due_at, scheduled_at, hold, hold_reason FROM issues WHERE id = $1', [id])).rows[0];
const activities = async (id: string) => (await pool.query('SELECT kind, payload FROM activities WHERE subject_id = $1 ORDER BY created_at, id', [id])).rows;
const area = () => `정리 ${crypto.randomUUID()}`;

it('returns today / overdue / waiting / week sections in Asia/Seoul, owner-scoped', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T15:30:00Z')); // 2026-10-13 00:30 KST (Tuesday)
  const where = area();
  const dueToday = await createTodo(owner, { area: where, title: '오늘 마감', dueAt: '2026-10-13' });
  const late = await createTodo(owner, { area: where, title: '어제 마감', dueAt: '2026-10-12' });
  const p1 = await createTodo(owner, { area: where, title: '급한 일', priority: 'p1', dueAt: '2026-10-15' });
  const waiting = await createTodo(owner, { area: where, title: '회신 대기', hold: 'waiting', holdReason: '메일' });
  const thursday = await createTodo(owner, { area: where, title: '목요일 마감', dueAt: '2026-10-15' });
  const planned = await createTodo(owner, { area: where, title: '금요일 예정', hold: 'scheduled', scheduledAt: '2026-10-16' });
  const far = await createTodo(owner, { area: where, title: '다음 달', dueAt: '2026-11-20' });
  const foreign = await createTodo(crypto.randomUUID(), { area: where, title: '남의 일', priority: 'p1' });

  const response = await app.request('/api/todos/today', { headers });
  expect(response.status).toBe(200);
  const view = await response.json();
  const ids = (key: string) => view[key].map((todo: { id: string }) => todo.id);
  expect(view.date).toBe('2026-10-13');
  expect(ids('today')).toEqual(expect.arrayContaining([dueToday.id, late.id, p1.id]));
  expect(ids('overdue')).toContain(late.id);
  expect(ids('overdue')).not.toContain(dueToday.id);
  expect(ids('waiting')).toContain(waiting.id);
  expect(ids('week')).toEqual(expect.arrayContaining([thursday.id, planned.id]));
  expect(ids('week')).not.toContain(p1.id); // already in today
  for (const key of ['today', 'overdue', 'waiting', 'week']) {
    expect(ids(key)).not.toContain(far.id);
    expect(ids(key)).not.toContain(foreign.id);
  }
  expect(view.today.find((todo: { id: string }) => todo.id === dueToday.id)).toMatchObject({ area: where, epic: '일반' });
  expect((await app.request('/api/todos/today')).status).toBe(401);
});

it('applies each bulk action in one call and logs via=ui per issue', async () => {
  const where = area();
  const [a, b] = [await createTodo(owner, { area: where, title: 'A' }), await createTodo(owner, { area: where, title: 'B', hold: 'scheduled', scheduledAt: '2026-10-14' })];

  const snooze = await bulk({ action: 'snooze', ids: [a.id, b.id], until: '2026-10-20' });
  expect(snooze.status).toBe(200);
  const result = await snooze.json();
  expect(result.todos).toHaveLength(2);
  expect(result.previous).toEqual(expect.arrayContaining([expect.objectContaining({ id: b.id, scheduledAt: '2026-10-14' })]));
  expect(await row(a.id)).toMatchObject({ due_at: null, scheduled_at: new Date('2026-10-19T15:00:00Z') });
  expect(await row(b.id)).toMatchObject({ due_at: null, scheduled_at: new Date('2026-10-19T15:00:00Z') });

  expect((await bulk({ action: 'hold', ids: [a.id], hold: 'blocked', holdReason: '리뷰 대기' })).status).toBe(200);
  expect(await row(a.id)).toMatchObject({ hold: 'blocked', hold_reason: '리뷰 대기' });
  expect((await bulk({ action: 'backlog', ids: [a.id] })).status).toBe(200);
  expect(await row(a.id)).toMatchObject({ status: 'backlog' });
  expect((await bulk({ action: 'complete', ids: [a.id, b.id] })).status).toBe(200);
  expect((await row(a.id)).status).toBe('done');
  // Completing again is a no-op: no extra activity.
  expect((await bulk({ action: 'complete', ids: [a.id] })).status).toBe(200);

  expect((await activities(a.id)).map((entry) => [entry.kind, entry.payload.via, entry.payload.bulk])).toEqual([
    ['issue.created', 'ui', undefined], ['issue.updated', 'ui', 'snooze'], ['issue.updated', 'ui', 'hold'], ['issue.updated', 'ui', 'backlog'], ['issue.completed', 'ui', 'complete']]);
});

it('undoes the last bulk action by restoring the previous snapshot', async () => {
  const where = area();
  const a = await createTodo(owner, { area: where, title: '되돌릴 일', dueAt: '2026-10-10', hold: 'waiting', holdReason: '답장' });
  const b = await createTodo(owner, { area: where, title: '되돌릴 일 2' });
  const { previous } = await (await bulk({ action: 'complete', ids: [a.id, b.id] })).json();
  expect((await row(a.id)).status).toBe('done');
  const undo = await bulk({ action: 'restore', items: previous });
  expect(undo.status).toBe(200);
  expect(await row(a.id)).toMatchObject({ status: 'todo', due_at: new Date('2026-10-09T15:00:00Z'), hold: 'waiting', hold_reason: '답장' });
  expect((await row(b.id)).status).toBe('todo');
  expect((await activities(a.id)).at(-1)).toMatchObject({ kind: 'issue.updated', payload: { via: 'ui', bulk: 'restore', changes: ['status'] } });
});

it('rejects invalid input and other owners’ ids without writing anything', async () => {
  const mine = await createTodo(owner, { area: area(), title: '내 일' });
  const theirs = await createTodo(crypto.randomUUID(), { area: area(), title: '남의 일' });
  const tooMany = Array.from({ length: 201 }, () => crypto.randomUUID());
  for (const body of [{}, { action: 'complete' }, { action: 'complete', ids: [] }, { action: 'complete', ids: ['nope'] }, { action: 'complete', ids: tooMany },
    { action: 'complete', ids: [mine.id, mine.id] }, { action: 'snooze', ids: [mine.id] }, { action: 'snooze', ids: [mine.id], until: '내일' },
    { action: 'hold', ids: [mine.id], hold: 'scheduled' }, { action: 'delete', ids: [mine.id] }, { action: 'complete', ids: [mine.id], extra: 1 }, 'text'])
    expect((await bulk(body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);

  // One foreign id rolls back the whole batch.
  expect((await bulk({ action: 'complete', ids: [mine.id, theirs.id] })).status).toBe(404);
  expect((await bulk({ action: 'complete', ids: [mine.id] }, other)).status).toBe(404);
  expect((await row(mine.id)).status).toBe('todo');
  expect((await row(theirs.id)).status).toBe('todo');
  expect(await activities(mine.id)).toHaveLength(1);
  expect((await app.request('/api/todos/bulk', { method: 'POST', body: '{}' })).status).toBe(401);
});

it('accepts 200 ids in one transaction', async () => {
  const where = area();
  const todos = await Promise.all(Array.from({ length: 200 }, (_, index) => createTodo(owner, { area: where, title: `대량 ${index}` })));
  const response = await bulk({ action: 'snooze', ids: todos.map((todo) => todo.id), until: '2026-10-21' });
  expect(response.status).toBe(200);
  expect((await pool.query('SELECT count(*)::int AS n FROM issues WHERE id = ANY($1) AND scheduled_at = $2', [todos.map((todo) => todo.id), new Date('2026-10-20T15:00:00Z')])).rows[0].n).toBe(200);
});

// YG-28 interplay: bulk 완료 rolls a recurring series exactly once; undo leaves it done (skipped) so the series keeps one open occurrence.
const openInSeries = async (recurrenceId: string) => (await pool.query("SELECT id FROM issues WHERE recurrence_id = $1 AND status <> 'done'", [recurrenceId])).rows.map((r) => r.id);

it('bulk complete spawns exactly one next occurrence of a recurring todo', async () => {
  const daily = await createTodo(owner, { area: area(), title: '물 마시기', recurrence: { freq: 'daily' } });
  const plain = await createTodo(owner, { area: area(), title: '일반 할 일' });
  const result = await (await bulk({ action: 'complete', ids: [daily.id, plain.id] })).json();
  expect(result.skipped).toEqual([]);
  const open = await openInSeries(daily.recurrence!.id);
  expect(open).toHaveLength(1);
  expect(open[0]).not.toBe(daily.id);
  expect((await bulk({ action: 'complete', ids: [daily.id] })).status).toBe(200); // retry: no second occurrence
  expect(await openInSeries(daily.recurrence!.id)).toEqual(open);
  expect((await activities(open[0])).at(0)).toMatchObject({ kind: 'issue.created', payload: { via: 'ui', bulk: 'complete', previousId: daily.id } });
});

it('undo of a bulk complete skips a recurring todo whose next occurrence exists', async () => {
  const weekly = await createTodo(owner, { area: area(), title: '주간 회고', recurrence: { freq: 'weekly', weekdays: ['fri'] } });
  const plain = await createTodo(owner, { area: area(), title: '되돌릴 일반' });
  const { previous } = await (await bulk({ action: 'complete', ids: [weekly.id, plain.id] })).json();
  const undo = await (await bulk({ action: 'restore', items: previous })).json();
  expect(undo.skipped).toEqual([weekly.id]);
  expect(undo.previous.map((item: { id: string }) => item.id)).toEqual([plain.id]);
  expect((await row(weekly.id)).status).toBe('done');
  expect((await row(plain.id)).status).toBe('todo');
  expect(await openInSeries(weekly.recurrence!.id)).toHaveLength(1);
});
