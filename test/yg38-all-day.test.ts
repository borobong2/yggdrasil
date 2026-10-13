import { readFileSync } from 'node:fs';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { formatDay, formatDue, isOverdue } from '../src/contracts/dates.js';
import { completeTodo, createTodo, getTodo, todayView, updateTodo } from '../src/server/todos.js';
import { bulkUpdateTodos } from '../src/server/todo-bulk.js';

// YG-38: a date without a time is that whole Asia/Seoul day.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });
const kst = (local: string) => new Date(`${local}+09:00`);
const at = (local: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(kst(local)); };
const owner = () => { const id = crypto.randomUUID(); installTestOwner(`yg38-${id}`, { id }); return { id, headers: { authorization: `Bearer yg38-${id}`, 'content-type': 'application/json' } }; };
const flags = async (id: string) => (await pool.query('SELECT due_at, due_all_day, scheduled_at, scheduled_all_day FROM issues WHERE id = $1', [id])).rows[0];

it('stores a date-only due/scheduled date as all-day and an instant as timed; clearing resets the flag', async () => {
  const me = owner();
  const allDay = await createTodo(me.id, { area: '날짜', title: '종일', dueAt: '2026-10-13', scheduledAt: '2026-10-12' });
  expect(allDay).toMatchObject({ dueAt: kst('2026-10-13T00:00:00').toISOString(), dueAllDay: true, scheduledAllDay: true });
  const timed = await createTodo(me.id, { area: '날짜', title: '시각', dueAt: '2026-10-13T21:00:00+09:00' });
  expect(timed).toMatchObject({ dueAllDay: false, scheduledAllDay: false });
  // Timed exactly at midnight stays timed.
  expect((await createTodo(me.id, { area: '날짜', title: '자정', dueAt: '2026-10-13T00:00:00+09:00' })).dueAllDay).toBe(false);

  expect(await updateTodo(me.id, allDay.id, { dueAt: '2026-10-14T09:30:00+09:00' })).toMatchObject({ dueAllDay: false, scheduledAllDay: true });
  expect(await updateTodo(me.id, timed.id, { dueAt: '2026-10-15' })).toMatchObject({ dueAllDay: true });
  expect(await updateTodo(me.id, allDay.id, { dueAt: null, scheduledAt: null })).toMatchObject({ dueAt: null, dueAllDay: false, scheduledAt: null, scheduledAllDay: false });

  // The UI PATCH route speaks the same rule.
  const response = await app.request(`/api/todos/${timed.id}`, { method: 'PATCH', headers: me.headers, body: JSON.stringify({ dueAt: '2026-10-20' }) });
  expect(await response.json()).toMatchObject({ dueAllDay: true, dueAt: kst('2026-10-20T00:00:00').toISOString() });
  // The legacy /api/issues route takes instants only: always timed.
  installTestOwner('yg38-legacy', { id: me.id });
  await app.request(`/api/issues/${timed.id}`, { method: 'PATCH', headers: { ...me.headers, authorization: 'Bearer yg38-legacy' }, body: JSON.stringify({ dueAt: '2026-10-21T03:00:00Z' }) });
  expect(await flags(timed.id)).toMatchObject({ due_all_day: false });
});

it('is overdue after the day for all-day and after the instant for timed, in todayView and the shared helper', async () => {
  const me = owner();
  at('2026-10-13T22:00:00');
  const allDayToday = await createTodo(me.id, { area: '마감', title: '오늘 종일', dueAt: '2026-10-13' });
  const allDayYesterday = await createTodo(me.id, { area: '마감', title: '어제 종일', dueAt: '2026-10-12' });
  const timedPast = await createTodo(me.id, { area: '마감', title: '오늘 21시', dueAt: '2026-10-13T21:00:00+09:00' });
  const timedLater = await createTodo(me.id, { area: '마감', title: '오늘 23시', dueAt: '2026-10-13T23:00:00+09:00' });

  const view = await todayView(me.id);
  expect(view.overdue.map((todo) => todo.title).sort()).toEqual(['어제 종일', '오늘 21시']);
  expect(view.today.map((todo) => todo.id)).toEqual(expect.arrayContaining([allDayToday.id, timedLater.id]));
  for (const todo of [allDayToday, allDayYesterday, timedPast, timedLater]) expect(isOverdue(todo), todo.title).toBe([allDayYesterday.id, timedPast.id].includes(todo.id));
  // Still today at 23:59 KST; overdue from 00:00 the next day.
  expect(isOverdue(allDayToday, kst('2026-10-13T23:59:59'))).toBe(false);
  expect(isOverdue(allDayToday, kst('2026-10-14T00:00:00'))).toBe(true);
  expect(isOverdue({ ...timedPast, status: 'done' })).toBe(false);
  expect((await todayView(me.id, kst('2026-10-14T00:00:01'))).overdue.map((todo) => todo.title).sort()).toEqual(['어제 종일', '오늘 21시', '오늘 23시', '오늘 종일']);
});

it('formats all-day as a date and timed with the Seoul time', () => {
  expect(formatDue('2026-10-12T15:00:00.000Z', true)).toBe('10/13');
  expect(formatDue('2026-10-13T12:00:00.000Z', false)).toBe('10/13 21:00');
  expect(formatDue('2026-10-12T15:00:00.000Z', false)).toBe('10/13 00:00');
  expect(formatDay('2026-10-12T15:00:00.000Z', true)).toBe('2026-10-13');
  expect(formatDay('2026-10-13T12:00:00.000Z', false)).toBe('2026-10-13 21:00');
});

it('makes occurrences of an untimed series all-day and of a timed series timed, including the next one', async () => {
  const me = owner();
  at('2026-10-13T08:00:00');
  const daily = await createTodo(me.id, { area: '반복', title: '물', recurrence: { freq: 'daily' } });
  const timed = await createTodo(me.id, { area: '반복', title: '스터디', recurrence: { freq: 'daily', time: '20:00' } });
  expect(daily).toMatchObject({ dueAllDay: true, dueAt: kst('2026-10-13T00:00:00').toISOString() });
  expect(timed).toMatchObject({ dueAllDay: false, dueAt: kst('2026-10-13T20:00:00').toISOString() });
  await completeTodo(me.id, daily.id);
  await completeTodo(me.id, timed.id);
  const next = (await pool.query("SELECT recurrence_id, due_all_day FROM issues WHERE recurrence_id = ANY($1) AND status = 'todo'", [[daily.recurrence!.id, timed.recurrence!.id]])).rows;
  expect(Object.fromEntries(next.map((row) => [row.recurrence_id, row.due_all_day]))).toEqual({ [daily.recurrence!.id]: true, [timed.recurrence!.id]: false });
});

it('bulk snooze sets an all-day date and undo restores timed vs all-day exactly', async () => {
  const me = owner();
  const timed = await createTodo(me.id, { area: '미루기', title: '시각 있음', dueAt: '2026-10-13T21:00:00+09:00' });
  const midnight = await createTodo(me.id, { area: '미루기', title: '자정 시각', dueAt: '2026-10-20T00:00:00+09:00' });
  const result = await bulkUpdateTodos(me.id, { action: 'snooze', ids: [timed.id, midnight.id], until: '2026-10-20' });
  // A timed midnight snoozed to that same day still changes: it becomes all-day.
  expect(result.todos.map((todo) => todo.dueAllDay)).toEqual([true, true]);
  expect(result.previous.find((item) => item.id === timed.id)!.dueAt).toBe(kst('2026-10-13T21:00:00').toISOString());
  await bulkUpdateTodos(me.id, { action: 'restore', items: result.previous });
  expect(await getTodo(me.id, timed.id)).toMatchObject({ dueAllDay: false, dueAt: kst('2026-10-13T21:00:00').toISOString() });
  expect(await getTodo(me.id, midnight.id)).toMatchObject({ dueAllDay: false, dueAt: kst('2026-10-20T00:00:00').toISOString() });
  const allDay = await createTodo(me.id, { area: '미루기', title: '종일', dueAt: '2026-10-15' });
  const again = await bulkUpdateTodos(me.id, { action: 'snooze', ids: [allDay.id], until: '2026-10-16' });
  expect(again.previous[0]!.dueAt).toBe('2026-10-15');
  await bulkUpdateTodos(me.id, { action: 'restore', items: again.previous });
  expect(await getTodo(me.id, allDay.id)).toMatchObject({ dueAllDay: true, dueAt: kst('2026-10-15T00:00:00').toISOString() });
});

it('migration 0015 marks 00:00 KST dates all-day (not timed-00:00 series) and backfills completed_at from the activity log', async () => {
  const sql = readFileSync(new URL('../drizzle/0015_todo_dates_archive.sql', import.meta.url), 'utf8');
  const updates = sql.match(/^UPDATE issues[\s\S]*?;$/gm)!;
  expect(updates).toHaveLength(3);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const me = crypto.randomUUID();
    const epic = crypto.randomUUID();
    const goal = crypto.randomUUID();
    await client.query('INSERT INTO goals (id, owner_id, title) VALUES ($1, $2, $3)', [goal, me, '이관']);
    await client.query('INSERT INTO epics (id, owner_id, goal_id, title) VALUES ($1, $2, $3, $4)', [epic, me, goal, '일반']);
    const rule = crypto.randomUUID();
    await client.query("INSERT INTO recurrences (id, owner_id, freq, time) VALUES ($1, $2, 'daily', '00:00')", [rule, me]);
    const row = async (title: string, dueAt: string | null, scheduledAt: string | null, extra: { status?: string; recurrenceId?: string } = {}) => {
      const id = crypto.randomUUID();
      await client.query('INSERT INTO issues (id, owner_id, epic_id, title, status, due_at, scheduled_at, recurrence_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [id, me, epic, title, extra.status ?? 'todo', dueAt, scheduledAt, extra.recurrenceId ?? null]);
      return id;
    };
    const midnight = await row('자정', '2026-10-12T15:00:00Z', '2026-10-11T15:00:00Z');
    const timed = await row('시각', '2026-10-13T12:00:00Z', '2026-10-12T15:00:01Z');
    const timedSeries = await row('자정 반복', '2026-10-12T15:00:00Z', null, { recurrenceId: rule });
    const done = await row('끝남', null, null, { status: 'done' });
    const doneNoLog = await row('기록 없음', null, null, { status: 'done' });
    await client.query("INSERT INTO activities (id, owner_id, actor_id, kind, subject_type, subject_id, payload, created_at) VALUES ($1, $2, $2, 'issue.completed', 'issue', $3, '{}', '2026-09-01T00:00:00Z'), ($4, $2, $2, 'issue.moved', 'issue', $3, '{\"to\":\"done\"}', '2026-09-02T00:00:00Z')",
      [crypto.randomUUID(), me, done, crypto.randomUUID()]);
    await client.query("UPDATE issues SET updated_at = '2026-08-01T00:00:00Z' WHERE id = $1", [doneNoLog]);
    for (const statement of updates) await client.query(statement);
    const { rows } = await client.query('SELECT id, due_all_day, scheduled_all_day, completed_at FROM issues WHERE owner_id = $1', [me]);
    const by = Object.fromEntries(rows.map((item) => [item.id, item]));
    expect(by[midnight]).toMatchObject({ due_all_day: true, scheduled_all_day: true, completed_at: null });
    expect(by[timed]).toMatchObject({ due_all_day: false, scheduled_all_day: false });
    expect(by[timedSeries]).toMatchObject({ due_all_day: false });
    expect(by[done].completed_at).toEqual(new Date('2026-09-02T00:00:00Z'));
    expect(by[doneNoLog].completed_at).toEqual(new Date('2026-08-01T00:00:00Z'));
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
