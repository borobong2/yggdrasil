import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app, createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { issuePat } from '../src/server/pats.js';
import { createTodo, getTodo, setArchived, updateTodo, type TodoInput } from '../src/server/todos.js';
import { moveIssue } from '../src/server/board.js';
import { createDocument } from '../src/server/documents.js';
import { weekReview } from '../src/server/review.js';
import { addDays, isoWeek, weekStart, type WeekReview } from '../src/contracts/review.js';

// YG-43: actual minutes + weekly review (KST weeks, completed_at grouping, estimate/actual, unfinished/overdue, isolation, MCP).
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
const kst = (local: string) => new Date(`${local}+09:00`);
const owner = () => { const id = crypto.randomUUID(); installTestOwner(`yg43-${id}`, { id }); return { id, headers: { authorization: `Bearer yg43-${id}` } }; };
const titles = (todos: { title: string }[]) => todos.map((todo) => todo.title).sort();

it('names weeks Monday–Sunday in Asia/Seoul with ISO week labels', () => {
  expect(weekStart('2026-10-12')).toBe('2026-10-12');
  expect(weekStart('2026-10-18')).toBe('2026-10-12');
  expect(weekStart('2026-10-19')).toBe('2026-10-19');
  expect(weekStart(new Date('2026-10-11T15:00:00Z'))).toBe('2026-10-12'); // Mon 00:00 KST
  expect(weekStart(new Date('2026-10-11T14:59:59Z'))).toBe('2026-10-05'); // Sun 23:59 KST
  expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
  expect(isoWeek('2026-10-12')).toBe('2026-W42');
  expect(isoWeek('2025-12-29')).toBe('2026-W01');
  expect(isoWeek('2026-12-28')).toBe('2026-W53');
  expect(isoWeek('2027-01-04')).toBe('2027-W01');
});

it('groups completions by completed_at, totals estimate vs actual, and lists unfinished and newly overdue todos', async () => {
  const me = owner();
  const done = async (title: string, completedAt: string, extra: Partial<TodoInput> = {}) => {
    const todo = await createTodo(me.id, { area: '커리어', title, ...extra });
    return updateTodo(me.id, todo.id, { status: 'done', completedAt });
  };
  await done('월 0시', '2026-09-28T00:00:00+09:00', { estimateMinutes: 30, actualMinutes: 45 });
  await done('일 23:59', '2026-10-04T23:59:00+09:00', { estimateMinutes: 60, actualMinutes: 40 });
  await done('지난주', '2026-09-27T23:59:00+09:00', { estimateMinutes: 10, actualMinutes: 10 });
  await done('다음주', '2026-10-05T00:00:00+09:00');
  await done('예상만', '2026-10-01', { area: '개인', estimateMinutes: 20 });
  const archived = await done('보관됨', '2026-10-01');
  await setArchived(me.id, archived.id, true);

  await createTodo(me.id, { area: '개인', title: '수요일 마감', dueAt: '2026-10-01' });
  await done('주 넘겨 완료', '2026-10-06', { dueAt: '2026-10-02' });
  await done('제때 완료', '2026-10-02', { dueAt: '2026-10-02' });
  await createTodo(me.id, { area: '개인', title: '지난 일요일 마감', dueAt: '2026-09-27' });
  await createTodo(me.id, { area: '개인', title: '일요일 밤 마감', dueAt: '2026-10-04T23:00:00+09:00' });
  await createTodo(me.id, { area: '개인', title: '다음주 마감', dueAt: '2026-10-05' });
  await setArchived(me.id, (await createTodo(me.id, { area: '개인', title: '보관 마감', dueAt: '2026-10-01' })).id, true);

  const review = await weekReview(me.id, '2026-10-01', kst('2026-10-14T12:00:00'));
  expect(review).toMatchObject({ start: '2026-09-28', end: '2026-10-04', week: '2026-W40', documentId: null });
  expect(review.completed.map((todo) => todo.title)).toEqual(['월 0시', '예상만', '제때 완료', '일 23:59']);
  expect(review.byArea).toEqual([{ area: '커리어', count: 3 }, { area: '개인', count: 1 }]);
  expect(review.minutes).toEqual({ compared: 2, estimated: 90, actual: 85, ratio: 0.94 });
  expect(titles(review.unfinished)).toEqual(['수요일 마감', '일요일 밤 마감', '주 넘겨 완료']);
  expect(titles(review.overdue)).toEqual(['수요일 마감', '일요일 밤 마감', '지난 일요일 마감']);

  // Mid-week: only days that have started count as unfinished; an all-day due is overdue once its day is over.
  const midweek = await weekReview(me.id, '2026-09-28', kst('2026-10-01T12:00:00'));
  expect(titles(midweek.unfinished)).toEqual(['수요일 마감']);
  expect(titles(midweek.overdue)).toEqual(['지난 일요일 마감']);

  // The week's 회고 메모 document is found by its title.
  const document = await createDocument(me.id, '주간 회고 2026-W40', '', null);
  expect((await weekReview(me.id, '2026-10-04', kst('2026-10-14T12:00:00'))).documentId).toBe(document.id);
});

it('serves GET /api/review/week owner-scoped, with activity counts by via', async () => {
  const me = owner();
  const a = await createTodo(me.id, { area: '잡일', title: '화면에서' });
  await createTodo(me.id, { area: '잡일', title: 'MCP로' }, 'mcp');
  await updateTodo(me.id, a.id, { status: 'done', actualMinutes: 15 });
  const b = await createTodo(me.id, { area: '잡일', title: '보드' });
  await moveIssue(me.id, b.id, 'doing', 0);

  const response = await app.request('/api/review/week', { headers: me.headers });
  expect(response.status).toBe(200);
  const review = await response.json() as WeekReview;
  expect(review.start).toBe(weekStart(new Date()));
  expect(review.activity).toEqual({ created: 3, completed: 1, moved: 1, via: { ui: 4, mcp: 1, github: 0, import: 0 } });
  expect(review.completed.map((todo) => [todo.title, todo.actualMinutes])).toEqual([['화면에서', 15]]);

  const intruder = owner();
  const theirs = await (await app.request('/api/review/week', { headers: intruder.headers })).json() as WeekReview;
  expect(theirs.completed).toEqual([]);
  expect(theirs.activity.created).toBe(0);
  expect((await app.request('/api/review/week?start=last-week', { headers: me.headers })).status).toBe(400);
  expect((await app.request('/api/review/week')).status).toBe(401);
});

it('records actual minutes via PATCH, complete, and MCP complete_todo/update_todo, and serves todo://review/week', async () => {
  const me = owner();
  const todo = await createTodo(me.id, { area: '잡일', title: '실제 시간', estimateMinutes: 30 });
  const headers = { ...me.headers, 'content-type': 'application/json' };
  expect(await (await app.request(`/api/todos/${todo.id}/complete`, { method: 'POST', headers, body: JSON.stringify({ actualMinutes: 50 }) })).json()).toMatchObject({ status: 'done', actualMinutes: 50 });
  expect(await (await app.request(`/api/todos/${todo.id}`, { method: 'PATCH', headers, body: JSON.stringify({ actualMinutes: 40 }) })).json()).toMatchObject({ actualMinutes: 40 });
  for (const value of [0, -5, 1.5, 100_001]) expect((await app.request(`/api/todos/${todo.id}`, { method: 'PATCH', headers, body: JSON.stringify({ actualMinutes: value }) })).status).toBe(400);

  const token = (await issuePat(me.id, 'yg43')).token;
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg43-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));
  try {
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { text: string }[])[0]!.text;
      return result.isError ? { error: text } : JSON.parse(text);
    };
    const open = await createTodo(me.id, { area: '잡일', title: 'MCP 완료', estimateMinutes: 20 });
    expect(await call('complete_todo', { id: open.id, actualMinutes: 25 })).toMatchObject({ status: 'done', actualMinutes: 25 });
    const activities = async () => (await pool.query('SELECT count(*)::int AS n FROM activities WHERE owner_id = $1', [me.id])).rows[0].n;
    const before = await activities();
    expect(await call('complete_todo', { id: open.id })).toMatchObject({ actualMinutes: 25 }); // idempotent
    expect(await activities()).toBe(before);
    expect(await call('complete_todo', { id: open.id, actualMinutes: 35 })).toMatchObject({ status: 'done', actualMinutes: 35 }); // already done: only sets the time
    expect(await call('update_todo', { id: open.id, actualMinutes: null })).toMatchObject({ actualMinutes: null });
    expect(await call('update_todo', { id: open.id, actualMinutes: 30 })).toMatchObject({ actualMinutes: 30 });
    expect(await call('complete_todo', { id: open.id, actualMinutes: -5 })).toHaveProperty('error');
    expect((await getTodo(me.id, open.id)).actualMinutes).toBe(30);
    const { rows } = await pool.query("SELECT payload FROM activities WHERE owner_id = $1 AND subject_id = $2 ORDER BY created_at DESC LIMIT 1", [me.id, open.id]);
    expect(rows[0].payload).toMatchObject({ via: 'mcp', changes: ['actualMinutes'] });

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain('todo://review/week');
    const text = ((await client.readResource({ uri: 'todo://review/week' })).contents[0] as { text: string }).text;
    expect(text).toContain(`# 주간 회고 ${isoWeek(weekStart(new Date()))}`);
    expect(text).toContain('## 이번 주 완료 2건');
    expect(text).toContain('2건 비교: 예상 50분 → 실제 70분 (1.4배)');
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
