import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { app } from '../src/server/app.js';
import { createTodo, todayView } from '../src/server/todos.js';
import type { LateTodo } from '../src/contracts/items.js';

// YG-34 오늘 작업대: merged 밀린 일 (마감 지남 ∪ 방치, no duplicates) with age buckets, today's timeline, archive route, 정리 모드 decisions + undo.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = '00000000-0000-4000-8000-000000000001';
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });

const NOW = new Date('2026-10-13T05:00:00Z'); // 2026-10-13 14:00 KST (Tuesday)
const post = (path: string, body?: unknown, as = headers) => app.request(path, { method: 'POST', headers: as, body: body === undefined ? undefined : JSON.stringify(body) });
const row = async (id: string) => (await pool.query('SELECT status, due_at, scheduled_at, hold, hold_reason, completed_at, archived_at FROM issues WHERE id = $1', [id])).rows[0];

it('밀린 일 merges overdue and stale once each, buckets by Seoul-day age, leaves backlog/held/done/today out; timeline has timed todos + ghosts', async () => {
  const user = crypto.randomUUID();
  const make = (title: string, extra: object = {}) => createTodo(user, { area: '개인', title, ...extra });
  const allDayYesterday = await make('어제 종일', { dueAt: '2026-10-12' });
  const timedYesterday = await make('어제 밤', { dueAt: '2026-10-12T23:30:00+09:00' });
  const threeDays = await make('3일 전', { dueAt: '2026-10-10' });
  const fourDays = await make('4일 전', { dueAt: '2026-10-09' });
  const thirty = await make('30일 전', { dueAt: '2026-09-13' });
  const thirtyOne = await make('31일 전', { dueAt: '2026-09-12', priority: 'p1' });
  const overdueAndStale = await make('마감도 방치도', { dueAt: '2026-09-01' }); // ≥ 14 days past due → also in staleView
  const untouched = await make('손 안 댄 일');
  await pool.query("UPDATE issues SET updated_at = '2026-09-01T00:00:00Z' WHERE id = $1", [untouched.id]);
  const waitingLate = await make('대기 중 마감 지남', { dueAt: '2026-10-11', hold: 'waiting' });
  const morning = await make('오늘 아침', { dueAt: '2026-10-13T09:00:00+09:00' });
  const evening = await make('오늘 저녁', { dueAt: '2026-10-13T21:00:00+09:00' });
  const allDayToday = await make('오늘 종일', { dueAt: '2026-10-13' });
  const backlog = await make('백로그', { dueAt: '2026-10-01', status: 'backlog' });
  const done = await make('끝난 일', { dueAt: '2026-10-01', status: 'done' });
  const series = await make('매일 21시', { dueAt: '2026-10-12T21:00:00+09:00', recurrence: { freq: 'daily', time: '21:00' } });

  const view = await todayView(user, NOW);
  const late = new Map(view.late.map((todo) => [todo.id, todo]));
  expect(view.late.length).toBe(late.size); // no duplicates
  const pick = (todo: { id: string }) => { const { lateDays, untouchedDays, age, bucket } = late.get(todo.id)!; return { lateDays, untouchedDays, age, bucket }; };
  expect(pick(allDayYesterday)).toMatchObject({ lateDays: 1, bucket: 'recent' });
  expect(pick(timedYesterday)).toMatchObject({ lateDays: 1, bucket: 'recent' }); // timed counts by Seoul day too
  expect(pick(threeDays)).toMatchObject({ lateDays: 3, bucket: 'recent' });
  expect(pick(fourDays)).toMatchObject({ lateDays: 4, bucket: 'month' });
  expect(pick(thirty)).toMatchObject({ lateDays: 30, bucket: 'month' });
  expect(pick(thirtyOne)).toMatchObject({ lateDays: 31, bucket: 'older' });
  expect(pick(overdueAndStale)).toMatchObject({ lateDays: 42, bucket: 'older' });
  expect(pick(untouched)).toMatchObject({ lateDays: null, untouchedDays: 42, age: 42, bucket: 'older' });
  expect(pick(series)).toMatchObject({ lateDays: 1 });
  for (const todo of [morning, evening, allDayToday, backlog, done, waitingLate]) expect(late.has(todo.id)).toBe(false);
  expect(view.overdue.map((todo) => todo.id)).toContain(morning.id); // YG-38 meaning kept for MCP todo://overdue
  expect((late.get(untouched.id) as LateTodo & { stale?: unknown }).stale).toBeUndefined();
  // Oldest first.
  expect(view.late.map((todo) => todo.age)).toEqual([...view.late.map((todo) => todo.age)].sort((a, b) => b - a));

  expect(view.timeline.todos.map((todo) => todo.id).sort()).toEqual([morning.id, evening.id].sort());
  expect(view.timeline.ghosts).toEqual([expect.objectContaining({ todoId: series.id, at: '2026-10-13T12:00:00.000Z', allDay: false })]);
});

it('GET /api/todos/today carries late + timeline, owner-scoped', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const mine = await createTodo(owner, { area: `yg34 ${crypto.randomUUID()}`, title: '내 밀린 일', dueAt: '2026-10-01' });
  const theirs = await createTodo(crypto.randomUUID(), { area: 'yg34', title: '남의 밀린 일', dueAt: '2026-10-01' });
  const view = await (await app.request('/api/todos/today', { headers })).json();
  const ids = view.late.map((todo: { id: string }) => todo.id);
  expect(ids).toContain(mine.id);
  expect(ids).not.toContain(theirs.id);
  expect(view.late.find((todo: { id: string }) => todo.id === mine.id)).toMatchObject({ lateDays: 12, bucket: 'month' });
  expect(view.timeline).toEqual({ todos: expect.any(Array), ghosts: expect.any(Array) });
});

it('archive / unarchive routes are owner-scoped and hide the todo from 오늘', async () => {
  const todo = await createTodo(owner, { area: `yg34 ${crypto.randomUUID()}`, title: '보관할 일', priority: 'p1' });
  expect((await post(`/api/todos/${todo.id}/archive`, undefined, other)).status).toBe(404);
  expect((await row(todo.id)).archived_at).toBeNull();
  expect((await post('/api/todos/not-a-uuid/archive')).status).toBe(400);
  expect((await app.request(`/api/todos/${todo.id}/archive`, { method: 'POST' })).status).toBe(401);

  const archived = await post(`/api/todos/${todo.id}/archive`);
  expect(archived.status).toBe(200);
  expect((await archived.json()).archivedAt).not.toBeNull();
  const today = await (await app.request('/api/todos/today', { headers })).json();
  expect(today.today.map((item: { id: string }) => item.id)).not.toContain(todo.id);
  const activity = (await pool.query("SELECT payload FROM activities WHERE subject_id = $1 AND kind = 'issue.archived'", [todo.id])).rows;
  expect(activity).toEqual([{ payload: { via: 'ui' } }]);

  expect((await post(`/api/todos/${todo.id}/unarchive`, undefined, other)).status).toBe(404);
  expect((await (await post(`/api/todos/${todo.id}/unarchive`)).json()).archivedAt).toBeNull();
});

it('정리 모드 decisions persist and each undo restores the todo (same calls the UI makes)', async () => {
  const where = `yg34 ${crypto.randomUUID()}`;
  const make = (title: string) => createTodo(owner, { area: where, title, dueAt: '2026-09-01', priority: 'p2' });
  const original = { status: 'todo', due_at: new Date('2026-08-31T15:00:00Z'), hold: null, hold_reason: null, completed_at: null, archived_at: null };
  const snapshot = (id: string) => ({ id, status: 'todo', dueAt: '2026-09-01', scheduledAt: null, hold: null, holdReason: null });
  const undo = async (id: string) => { expect((await post('/api/todos/bulk', { action: 'restore', items: [snapshot(id)] })).status).toBe(200); expect(await row(id)).toMatchObject(original); };

  // D 이미 했어 (완료일 = 마감일).
  const d = await make('D');
  expect((await post(`/api/todos/${d.id}/complete`, { completedAt: '2026-09-01' })).status).toBe(200);
  expect(await row(d.id)).toMatchObject({ status: 'done', completed_at: new Date('2026-09-01T03:00:00Z') });
  await undo(d.id);
  // T → 오늘, W → 다음 주 (월요일), all-day.
  const t = await make('T');
  const movedT = await (await post('/api/todos/bulk', { action: 'snooze', ids: [t.id], until: '2026-10-14' })).json();
  expect(await row(t.id)).toMatchObject({ due_at: original.due_at, scheduled_at: new Date('2026-10-13T15:00:00Z') });
  expect((await post('/api/todos/bulk', { action: 'restore', items: movedT.previous })).status).toBe(200);
  expect(await row(t.id)).toMatchObject({ ...original, scheduled_at: null });
  const w = await make('W');
  const movedW = await (await post('/api/todos/bulk', { action: 'snooze', ids: [w.id], until: '2026-10-19' })).json();
  expect(await row(w.id)).toMatchObject({ due_at: original.due_at, scheduled_at: new Date('2026-10-18T15:00:00Z') });
  expect((await post('/api/todos/bulk', { action: 'restore', items: movedW.previous })).status).toBe(200);
  expect(await row(w.id)).toMatchObject({ ...original, scheduled_at: null });
  // B → 백로그, H → 대기 + 사유.
  const b = await make('B');
  await post('/api/todos/bulk', { action: 'backlog', ids: [b.id] });
  expect(await row(b.id)).toMatchObject({ status: 'backlog' });
  await undo(b.id);
  const h = await make('H');
  await post('/api/todos/bulk', { action: 'hold', ids: [h.id], hold: 'waiting', holdReason: '회신' });
  expect(await row(h.id)).toMatchObject({ hold: 'waiting', hold_reason: '회신' });
  await undo(h.id);
  // A 보관 → unarchive.
  const a = await make('A');
  await post(`/api/todos/${a.id}/archive`);
  expect((await row(a.id)).archived_at).not.toBeNull();
  await post(`/api/todos/${a.id}/unarchive`);
  expect(await row(a.id)).toMatchObject(original);
});
