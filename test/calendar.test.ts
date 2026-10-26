import { afterEach, expect, it, vi } from 'vitest';
import { app } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { completeTodo, createTodo, updateTodo } from '../src/server/todos.js';
import type { CalendarView } from '../src/contracts/items.js';
import { addDays, dayOf, monthGrid, moveKeepingTime, parseCalendarHash, rangeOf, seoulMinutes, shift, slotAt, weekStart } from '../src/client/calendar-dates.js';

afterEach(() => { vi.useRealTimers(); });
const kst = (local: string) => new Date(`${local}+09:00`);
const at = (local: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(kst(local)); };
const owner = () => { const id = crypto.randomUUID(); installTestOwner(`yg30-${id}`, { id }); return { id, headers: { authorization: `Bearer yg30-${id}` } }; };
const range = async (headers: Record<string, string>, query: string) => {
  const response = await app.request(`/api/calendar?${query}`, { headers });
  expect(response.status).toBe(200);
  return response.json() as Promise<CalendarView>;
};
const titles = (list: { title: string }[]) => list.map((item) => item.title).sort();

it('returns todos by scheduledAt (else dueAt) on Seoul boundaries plus unscheduled open todos', async () => {
  const me = owner();
  // 2026-10-13 00:00 KST = 10-12T15:00Z; 23:59 KST on the 13th = 14:59Z.
  await createTodo(me.id, { area: '캘', title: '자정 직후', dueAt: '2026-10-13T00:00:00+09:00' });
  await createTodo(me.id, { area: '캘', title: '밤 늦게', dueAt: '2026-10-13T23:59:00+09:00' });
  await createTodo(me.id, { area: '캘', title: '전날 밤', dueAt: '2026-10-12T23:59:00+09:00' });
  await createTodo(me.id, { area: '캘', title: '예정만', scheduledAt: '2026-10-13' });
  await createTodo(me.id, { area: '캘', title: '예정이 우선', dueAt: '2026-10-20', scheduledAt: '2026-10-13' });
  await createTodo(me.id, { area: '캘', title: '날짜 없음' });
  const done = await createTodo(me.id, { area: '캘', title: '끝난 일', dueAt: '2026-10-13' });
  await completeTodo(me.id, done.id);

  const view = await range(me.headers, 'from=2026-10-13&to=2026-10-13');
  expect(titles(view.todos)).toEqual(['밤 늦게', '예정만', '예정이 우선', '자정 직후'].sort());
  expect(titles(view.undated)).toEqual(['날짜 없음', '밤 늦게', '자정 직후', '전날 밤'].sort());
  expect(titles((await range(me.headers, 'from=2026-10-13&to=2026-10-13&done=1')).todos)).toEqual(['끝난 일', '밤 늦게', '예정만', '예정이 우선', '자정 직후'].sort());
  expect(titles((await range(me.headers, 'from=2026-10-12&to=2026-10-20')).todos)).toContain('예정이 우선');
});

it('isolates owners and validates the range', async () => {
  const [me, other] = [owner(), owner()];
  await createTodo(me.id, { area: '캘', title: '내 일', dueAt: '2026-10-13' });
  await createTodo(me.id, { area: '캘', title: '내 반복', recurrence: { freq: 'daily' } });
  await createTodo(me.id, { area: '캘', title: '내 미정' });
  const theirs = await range(other.headers, 'from=2026-10-01&to=2026-11-30');
  expect(theirs).toEqual({ from: '2026-10-01', to: '2026-11-30', todos: [], undated: [], ghosts: [] });
  expect((await app.request('/api/calendar?from=2026-10-01&to=2026-10-02')).status).toBe(401);
  for (const query of ['', 'from=2026-10-13', 'from=2026-10-13&to=2026-10-12', 'from=2026-10-01&to=2026-12-31', 'from=13-10-2026&to=2026-10-14', 'from=2026-10-13&to=2026-10-14&done=yes'])
    expect((await app.request(`/api/calendar?${query}`, { headers: me.headers })).status, query).toBe(400);
});

it('previews weekly ghosts after the open occurrence (honouring a one-off move) without creating rows', async () => {
  const me = owner();
  at('2026-10-12T08:00:00');
  const study = await createTodo(me.id, { area: '국민대', title: '월급 스터디', recurrence: { freq: 'weekly', weekdays: ['mon', 'wed'], time: '10:00' } });
  await updateTodo(me.id, study.id, { dueAt: '2026-10-13T21:00:00+09:00' }); // this week only
  const view = await range(me.headers, 'from=2026-10-12&to=2026-10-25');
  expect(view.todos.map((todo) => todo.id)).toEqual([study.id]);
  expect(view.ghosts.map((ghost) => ghost.at)).toEqual(['2026-10-14T10:00:00', '2026-10-19T10:00:00', '2026-10-21T10:00:00'].map((local) => kst(local).toISOString()));
  expect(view.ghosts[0]).toMatchObject({ recurrenceId: study.recurrence!.id, todoId: study.id, title: '월급 스터디', allDay: false });
  expect((await range(me.headers, 'from=2026-10-12&to=2026-10-25')).ghosts).toHaveLength(3); // still no rows
  // Paused series show no ghosts.
  await updateTodo(me.id, study.id, { recurrence: { freq: 'weekly', weekdays: ['mon', 'wed'], time: '10:00', paused: true } });
  expect((await range(me.headers, 'from=2026-10-12&to=2026-10-25')).ghosts).toEqual([]);
});

it('previews monthly ghosts on month end and skips past slots for an overdue occurrence', async () => {
  const me = owner();
  at('2026-10-13T09:00:00');
  await createTodo(me.id, { area: '루틴', title: '월말 정산', dueAt: '2026-10-31', recurrence: { freq: 'monthly', monthDay: 31 } });
  const ghosts = (await range(me.headers, 'from=2026-10-01&to=2026-12-01')).ghosts;
  expect(ghosts.map((ghost) => [ghost.at, ghost.allDay])).toEqual([[kst('2026-11-30T00:00:00').toISOString(), true]]);
  const feb = (await range(me.headers, 'from=2027-01-15&to=2027-03-15')).ghosts.map((ghost) => ghost.at);
  expect(feb).toEqual([kst('2027-01-31T00:00:00').toISOString(), kst('2027-02-28T00:00:00').toISOString()]);
  // Overdue daily occurrence (Oct 1): completing now would land on Oct 14, so ghosts start there.
  await createTodo(me.id, { area: '루틴', title: '물 주기', dueAt: '2026-10-01', recurrence: { freq: 'daily' } });
  const daily = (await range(me.headers, 'from=2026-10-01&to=2026-10-16')).ghosts.filter((ghost) => ghost.title === '물 주기');
  expect(daily.map((ghost) => ghost.at)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'].map((day) => kst(`${day}T00:00:00`).toISOString()));
});

it('date math: grids, ranges, hash, KST minutes and moves', () => {
  expect(weekStart('2026-10-13')).toBe('2026-10-11'); // Tue → Sun
  expect(weekStart('2026-10-18')).toBe('2026-10-18'); // Sunday starts its own week
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  const grid = monthGrid('2026-02-15');
  expect([grid[0], grid.at(-1), grid.length]).toEqual(['2026-02-01', '2026-02-28', 28]);
  expect(monthGrid('2026-03-31').length).toBe(35); // Mar starts Sunday
  expect(rangeOf('week', '2026-10-15')).toEqual({ from: '2026-10-11', to: '2026-10-17' });
  expect(rangeOf('3day', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-10-17' });
  expect(rangeOf('day', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-10-15' });
  expect(rangeOf('list', '2026-10-15')).toEqual({ from: '2026-10-15', to: '2026-11-13' });
  expect(shift('month', '2026-01-31', 1)).toBe('2026-02-01');
  expect(shift('3day', '2026-10-15', -1)).toBe('2026-10-12');
  expect(parseCalendarHash('#/calendar/week/2026-10-13')).toEqual({ view: 'week', day: '2026-10-13' });
  expect(parseCalendarHash('#/calendar/bogus/2026-99-99')).toEqual({ view: null, day: null });
  expect(dayOf('2026-10-12T15:00:00.000Z')).toBe('2026-10-13');
  expect(seoulMinutes('2026-10-12T15:00:00.000Z')).toBe(0);
  expect(seoulMinutes('2026-10-13T12:15:00.000Z')).toBe(21 * 60 + 15);
  expect(slotAt('2026-10-13', 9 * 60 + 45)).toBe('2026-10-13T09:45:00+09:00');
  expect(moveKeepingTime('2026-10-13T01:30:00.000Z', '2026-10-20', false)).toBe('2026-10-20T10:30:00+09:00');
  expect(moveKeepingTime('2026-10-12T15:00:00.000Z', '2026-10-20', false)).toBe('2026-10-20T00:00:00+09:00'); // timed midnight stays timed
  expect(moveKeepingTime('2026-10-12T15:00:00.000Z', '2026-10-20', true)).toBe('2026-10-20'); // all-day stays all-day
});
