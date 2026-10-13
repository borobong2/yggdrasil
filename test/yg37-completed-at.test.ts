import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { completeTodo, createTodo, getTodo, parseCompletedAt, updateTodo } from '../src/server/todos.js';
import { bulkUpdateTodos } from '../src/server/todo-bulk.js';
import { moveIssue } from '../src/server/board.js';

// YG-37: completed_at on every completion path, backdating, and recurring anchors.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });
const kst = (local: string) => new Date(`${local}+09:00`);
const at = (local: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(kst(local)); };
const owner = () => { const id = crypto.randomUUID(); installTestOwner(`yg37-${id}`, { id }); return { id, headers: { authorization: `Bearer yg37-${id}`, 'content-type': 'application/json' } }; };
const completedAt = async (id: string) => (await pool.query('SELECT completed_at FROM issues WHERE id = $1', [id])).rows[0].completed_at as Date | null;

it('stamps completed_at on every completion path and clears it on reopen', async () => {
  const me = owner();
  const make = (title: string) => createTodo(me.id, { area: '완료', title });
  const [service, route, bulk, board, legacy, reopened] = await Promise.all(['service', 'route', 'bulk', 'board', 'legacy', 'reopened'].map(make));
  await updateTodo(me.id, service.id, { status: 'done' });
  expect((await app.request(`/api/todos/${route.id}/complete`, { method: 'POST', headers: me.headers })).status).toBe(200);
  await bulkUpdateTodos(me.id, { action: 'complete', ids: [bulk.id] });
  await moveIssue(me.id, board.id, 'done', 0);
  installTestOwner(`yg37-legacy-${me.id}`, { id: me.id });
  await app.request(`/api/issues/${legacy.id}`, { method: 'PATCH', headers: { ...me.headers, authorization: `Bearer yg37-legacy-${me.id}` }, body: JSON.stringify({ status: 'done' }) });
  const imported = await createTodo(me.id, { area: '완료', title: 'imported done', status: 'done' }, 'import');
  for (const todo of [service, route, bulk, board, legacy, imported]) expect(await completedAt(todo.id), todo.title).toBeInstanceOf(Date);
  expect((await getTodo(me.id, service.id)).completedAt).toEqual((await completedAt(service.id))!.toISOString());

  // Reopen: service, bulk restore, board move back.
  await completeTodo(me.id, reopened.id);
  await updateTodo(me.id, reopened.id, { status: 'todo' });
  const { previous } = await bulkUpdateTodos(me.id, { action: 'complete', ids: [service.id, bulk.id] });
  expect(previous.map((item) => item.status)).toEqual(['done', 'done']);
  await bulkUpdateTodos(me.id, { action: 'backlog', ids: [bulk.id] });
  await moveIssue(me.id, board.id, 'todo', 0);
  for (const todo of [reopened, bulk, board]) expect(await completedAt(todo.id), todo.title).toBeNull();
  // A done → done board reorder keeps the date.
  const before = await completedAt(legacy.id);
  await moveIssue(me.id, legacy.id, 'done', 0);
  expect(await completedAt(legacy.id)).toEqual(before);
});

it('accepts a backdated completedAt (date = noon KST, clamped to now), rejects the future, and needs a done todo', async () => {
  const me = owner();
  at('2026-10-13T09:00:00');
  expect(parseCompletedAt('2026-10-10')).toEqual(kst('2026-10-10T12:00:00'));
  expect(parseCompletedAt('2026-10-13')).toEqual(kst('2026-10-13T09:00:00')); // today before noon → now
  expect(parseCompletedAt('2026-10-12T23:10:00+09:00')).toEqual(kst('2026-10-12T23:10:00'));

  const todo = await createTodo(me.id, { area: '완료', title: '지난주에 함' });
  const response = await app.request(`/api/todos/${todo.id}/complete`, { method: 'POST', headers: me.headers, body: JSON.stringify({ completedAt: '2026-10-10' }) });
  expect(await response.json()).toMatchObject({ status: 'done', completedAt: kst('2026-10-10T12:00:00').toISOString() });

  // Editing the date of a done todo (TodoDetail PATCH) and via complete again.
  expect(await (await app.request(`/api/todos/${todo.id}`, { method: 'PATCH', headers: me.headers, body: JSON.stringify({ completedAt: '2026-10-11' }) })).json())
    .toMatchObject({ completedAt: kst('2026-10-11T12:00:00').toISOString() });
  expect((await completeTodo(me.id, todo.id, 'mcp', '2026-10-12T08:00:00+09:00')).completedAt).toBe(kst('2026-10-12T08:00:00').toISOString());

  const open = await createTodo(me.id, { area: '완료', title: '아직' });
  const activities = async () => (await pool.query('SELECT count(*)::int AS n FROM activities WHERE owner_id = $1', [me.id])).rows[0].n;
  const count = await activities();
  for (const [url, body] of [
    [`/api/todos/${open.id}/complete`, { completedAt: '2026-10-14' }], [`/api/todos/${open.id}/complete`, { completedAt: '2026-10-13T09:10:00+09:00' }],
    [`/api/todos/${open.id}/complete`, { completedAt: 'yesterday' }], [`/api/todos/${open.id}/complete`, { when: '2026-10-10' }]
  ] as const) expect((await app.request(url, { method: 'POST', headers: me.headers, body: JSON.stringify(body) })).status, JSON.stringify(body)).toBe(400);
  // completedAt on a todo that is not done
  expect((await app.request(`/api/todos/${open.id}`, { method: 'PATCH', headers: me.headers, body: JSON.stringify({ completedAt: '2026-10-10' }) })).status).toBe(400);
  // 5 minutes of clock skew is fine
  expect((await app.request(`/api/todos/${open.id}/complete`, { method: 'POST', headers: me.headers, body: JSON.stringify({ completedAt: '2026-10-13T09:04:00+09:00' }) })).status).toBe(200);
  expect(await activities()).toBe(count + 1);
  expect((await getTodo(me.id, open.id)).status).toBe('done');

  // Owner isolation
  const intruder = owner();
  expect((await app.request(`/api/todos/${todo.id}/complete`, { method: 'POST', headers: intruder.headers, body: JSON.stringify({ completedAt: '2026-10-01' }) })).status).toBe(404);
  expect((await getTodo(me.id, todo.id)).completedAt).toBe(kst('2026-10-12T08:00:00').toISOString());
});

it('rolls a recurring series from the later of its slot and completedAt, not from now', async () => {
  const me = owner();
  at('2026-10-08T08:00:00');
  const daily = await createTodo(me.id, { area: '반복', title: '일기', dueAt: '2026-10-10', recurrence: { freq: 'daily' } });
  const weekly = await createTodo(me.id, { area: '반복', title: '스터디', dueAt: '2026-10-05T10:00:00+09:00', recurrence: { freq: 'weekly', weekdays: ['mon'], time: '10:00' } });
  const late = await createTodo(me.id, { area: '반복', title: '운동', dueAt: '2026-10-09', recurrence: { freq: 'daily' } });
  at('2026-10-13T09:00:00');
  const next = async (recurrenceId: string) => (await pool.query("SELECT due_at FROM issues WHERE recurrence_id = $1 AND status <> 'done'", [recurrenceId])).rows.map((row) => row.due_at);

  // Done on its own day, logged 3 days later: next is the day after the slot, not tomorrow.
  await completeTodo(me.id, daily.id, 'mcp', '2026-10-10');
  expect(await next(daily.recurrence!.id)).toEqual([kst('2026-10-11T00:00:00')]);
  // Backdated before the slot: the slot still wins (no slot is repeated).
  await completeTodo(me.id, weekly.id, 'ui', '2026-10-01');
  expect(await next(weekly.recurrence!.id)).toEqual([kst('2026-10-12T10:00:00')]);
  // Done late (after its slot) on 10/11: next is 10/12.
  await completeTodo(me.id, late.id, 'ui', '2026-10-11T20:00:00+09:00');
  expect(await next(late.recurrence!.id)).toEqual([kst('2026-10-12T00:00:00')]);
  // Without completedAt the anchor is now (unchanged behaviour): next after 10/13 09:00.
  const plain = await createTodo(me.id, { area: '반복', title: '물', dueAt: '2026-10-10', recurrence: { freq: 'daily' } });
  await completeTodo(me.id, plain.id);
  expect(await next(plain.recurrence!.id)).toEqual([kst('2026-10-14T00:00:00')]);
});
