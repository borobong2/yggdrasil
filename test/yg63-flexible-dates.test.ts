import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { calendarView, createTodo, getTodo, todayView, updateTodo } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
const owner = () => { const id = crypto.randomUUID(); const token = `yg63-${id}`; installTestOwner(token, { id }); return { id, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }; };
const post = (body: unknown, headers?: Record<string, string>) => app.request('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const patch = (id: string, body: unknown, headers: Record<string, string>) => app.request(`/api/todos/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });

it('creates a title-only todo in the authenticated owner’s default placement without dates', async () => {
  const me = owner();
  const response = await post({ title: '  날짜 없는 할 일  ' }, me.headers);
  expect(response.status).toBe(200); // existing POST response convention
  const todo = await response.json();
  expect(todo).toMatchObject({ title: '날짜 없는 할 일', area: '개인', epic: '일반', status: 'todo', dueAt: null, scheduledAt: null, targetAt: null, targetAllDay: false });
  expect((await post({ title: '인증 없음' })).status).toBe(401);
  expect((await post({ title: '   ' }, me.headers)).status).toBe(400);
  const custom = await (await post({ title: '명시 소속', area: '잡일', targetAt: '2026-10-27' }, me.headers)).json();
  expect(custom).toMatchObject({ area: '잡일', targetAllDay: true });
  const other = owner();
  expect((await patch(todo.id, { targetAt: '2026-10-27' }, other.headers)).status).toBe(404);
});

it('round trips independent equal/reversed dates and clears just the requested field', async () => {
  const me = owner();
  const date = '2026-10-27';
  const response = await post({ area: '시험', title: '세 날짜', dueAt: date, scheduledAt: date, targetAt: date }, me.headers);
  expect(response.status).toBe(200);
  const todo = await response.json();
  expect(todo).toMatchObject({ dueAt: '2026-10-26T15:00:00.000Z', scheduledAt: '2026-10-26T15:00:00.000Z', targetAt: '2026-10-26T15:00:00.000Z', dueAllDay: true, scheduledAllDay: true, targetAllDay: true });
  const instant = '2026-10-27T00:00:00+09:00';
  const same = await (await patch(todo.id, { dueAt: instant, scheduledAt: instant, targetAt: instant }, me.headers)).json();
  expect(same).toMatchObject({ dueAt: todo.dueAt, scheduledAt: todo.scheduledAt, targetAt: todo.targetAt, dueAllDay: false, scheduledAllDay: false, targetAllDay: false });
  const reversed = await (await patch(todo.id, { scheduledAt: '2026-11-02', targetAt: '2026-11-01', dueAt: '2026-10-31T23:59:00+09:00' }, me.headers)).json();
  expect(reversed).toMatchObject({ targetAllDay: true, dueAt: '2026-10-31T14:59:00.000Z' });
  const preserved = await updateTodo(me.id, todo.id, { title: '이름만 변경' });
  expect(preserved).toMatchObject({ targetAt: reversed.targetAt, scheduledAt: reversed.scheduledAt, dueAt: reversed.dueAt });
  for (const field of ['targetAt', 'scheduledAt', 'dueAt']) {
    const before = await getTodo(me.id, todo.id);
    const cleared = await (await patch(todo.id, { [field]: null }, me.headers)).json();
    expect(cleared[field]).toBeNull();
    const flags: Record<string, string> = { targetAt: 'targetAllDay', scheduledAt: 'scheduledAllDay', dueAt: 'dueAllDay' };
    expect(cleared[flags[field]!]).toBe(false);
    for (const other of ['targetAt', 'scheduledAt', 'dueAt'].filter(key => key !== field)) expect(cleared[other]).toBe(before[other as keyof typeof before]);
  }
});

it('rejects invalid target dates and logs target changes with all-day/time meaning', async () => {
  const me = owner();
  const todo = await createTodo(me.id, { area: '검증', title: '목표 검증' });
  for (const targetAt of ['tomorrow', '2026-02-30', '2026-10-27T09:00:00', 12]) expect((await patch(todo.id, { targetAt }, me.headers)).status).toBe(400);
  const updated = await (await patch(todo.id, { targetAt: '2026-10-27T09:30:00+09:00' }, me.headers)).json();
  expect(updated).toMatchObject({ targetAt: '2026-10-27T00:30:00.000Z', targetAllDay: false, completedAt: null });
  const rows = await pool.query('SELECT payload FROM activities WHERE subject_id=$1 ORDER BY created_at DESC', [todo.id]);
  expect(rows.rows[0].payload).toMatchObject({ via: 'ui', diff: { targetAt: [null, '2026-10-27 09:30'] } });
});

it('includes start/target arrivals once in today and future dates in upcoming without external overdue', async () => {
  const me = owner();
  const create = (title: string, extra: Omit<Parameters<typeof createTodo>[1], 'area' | 'title'>) => createTodo(me.id, { area: '일정', title, ...extra });
  const start = await create('오늘 시작', { scheduledAt: '2026-10-26', dueAt: '2026-10-31' });
  const target = await create('오늘 목표', { targetAt: '2026-10-26' });
  const past = await create('지난 목표', { targetAt: '2026-10-25' });
  const all = await create('세 날짜 오늘', { scheduledAt: '2026-10-26', targetAt: '2026-10-26', dueAt: '2026-10-26' });
  const future = await create('내일 목표', { targetAt: '2026-10-27' });
  const backlog = await create('목표 백로그', { status: 'backlog', targetAt: '2026-10-26' });
  const p1 = await create('날짜 없는 P1', { priority: 'p1' });
  for (const hold of ['waiting', 'blocked', 'scheduled'] as const) await create(`보류 ${hold}`, { hold, targetAt: '2026-10-26', scheduledAt: '2026-10-30' });
  await create('완료', { status: 'done', targetAt: '2026-10-26' });
  await create('날짜 없음', {});
  const view = await todayView(me.id, new Date('2026-10-26T09:00:00+09:00'));
  expect(new Set(view.today.map(t => t.id))).toEqual(new Set([start.id, target.id, past.id, all.id, backlog.id, p1.id]));
  expect(view.today).toHaveLength(6);
  expect(view.week.map(t => t.id)).toContain(future.id);
  expect(view.week.map(t => t.id)).not.toContain(start.id);
  expect(view.overdue).toHaveLength(0);
  const calendar = await calendarView(me.id, '2026-10-26', '2026-10-26');
  expect(calendar.undated.map(t => t.id)).toContain(target.id);
  expect(calendar.todos.map(t => t.id)).not.toContain(start.id); // default calendar is still due-first
});
