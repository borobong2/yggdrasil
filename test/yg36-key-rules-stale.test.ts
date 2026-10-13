import { readFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app, createApp } from '../src/server/app.js';
import { issuePat } from '../src/server/pats.js';
import { completeTodo, createTodo, createTodos, setArchived, staleView } from '../src/server/todos.js';
import { setEpicPrefix } from '../src/server/ticket-keys.js';
import { staleReasons } from '../src/contracts/stale.js';

// YG-36 epic default ticket prefixes and YG-41 stale detection.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
const owner = '00000000-0000-4000-8000-000000000001';
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };
const unique = () => crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const prefixOf = () => `T${unique().replace(/[^A-Z0-9]/g, '')}`.slice(0, 8);
const json = (body: unknown) => JSON.stringify(body);

async function connect(ownerId: string) {
  const token = (await issuePat(ownerId, 'yg36')).token;
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg36-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  const call = async (name: string, args: unknown) => {
    const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
    expect(result.isError).not.toBe(true);
    return JSON.parse((result.content as { text: string }[])[0]!.text);
  };
  const read = async (uri: string) => ((await client.readResource({ uri })).contents[0] as { text: string }).text;
  return { call, read, close };
}

it('YG-36: new todos in an epic with a default prefix get the next key on every create path; prefix null opts out', async () => {
  const user = crypto.randomUUID();
  const prefix = prefixOf();
  const seed = await createTodo(user, { area: '프로젝트', epic: 'keyed', title: 'seed', prefix: null });
  expect(seed.key).toBeNull();
  await setEpicPrefix(user, seed.epicId, prefix.toLowerCase(), 40);

  // Service / import path (import-one-thing calls createTodo without prefix).
  expect((await createTodo(user, { area: '프로젝트', epic: 'keyed', title: 'import' }, 'import')).key).toBe(`${prefix}-40`);
  expect((await createTodo(user, { area: '프로젝트', epic: 'keyed', title: 'opt out', prefix: null })).key).toBeNull();
  expect((await createTodo(user, { area: '프로젝트', epic: 'keyed', title: 'explicit', prefix: 'OTHER' })).key).toBe('OTHER-1');
  expect((await createTodo(user, { area: '프로젝트', epic: 'plain', title: 'no default' })).key).toBeNull();

  const mcp = await connect(user);
  try {
    expect((await mcp.call('create_todo', { area: '프로젝트', epic: 'keyed', title: 'mcp one' })).key).toBe(`${prefix}-41`);
    expect((await mcp.call('create_todo', { area: '프로젝트', epic: 'keyed', title: 'mcp none', prefix: null })).key).toBeNull();
    const batch = await mcp.call('create_todos', { items: [
      { area: '프로젝트', epic: 'keyed', title: 'b1' }, { area: '프로젝트', epic: 'plain', title: 'b2' },
      { area: '프로젝트', epic: 'keyed', title: 'b3', prefix: null }, { area: '프로젝트', epic: 'keyed', title: 'b4' }
    ] });
    expect(batch.map((todo: { key: string | null }) => todo.key)).toEqual([`${prefix}-42`, null, null, `${prefix}-43`]);
    expect((await mcp.call('list_todos', { hasKey: false, epic: 'keyed' })).todos.map((todo: { title: string }) => todo.title).sort()).toEqual(['b3', 'mcp none', 'opt out', 'seed']);
  } finally { await mcp.close(); }

  // A brand-new epic never has a default.
  expect((await createTodos(user, [{ area: '새 영역', epic: '새 에픽', title: 'fresh' }]))[0]!.key).toBeNull();
});

it('YG-36: the UI create route uses the epic default, honors prefix null, and rejects bad prefixes', async () => {
  const prefix = prefixOf();
  const seed = await createTodo(owner, { area: `yg36 ${unique()}`, title: 'seed' });
  const set = await app.request(`/api/ticket-prefixes/${seed.epicId}`, { method: 'PUT', headers, body: json({ prefix }) });
  expect(set.status).toBe(200);
  const create = (body: Record<string, unknown>) => app.request('/api/issues', { method: 'POST', headers, body: json({ title: 'ui', epicId: seed.epicId, ...body }) });
  expect((await (await create({})).json()).key).toBe(`${prefix}-1`);
  expect((await (await create({ prefix: '' })).json()).key).toBe(`${prefix}-2`);
  expect((await (await create({ prefix: null })).json()).key).toBeNull();
  expect((await create({ prefix: '1bad' })).status).toBe(400);
  expect((await create({ prefix: 7 })).status).toBe(400);
});

it('YG-36: promote gives a keyless todo the epic default or an explicit prefix; keys are permanent', async () => {
  const prefix = prefixOf();
  const keyed = await createTodo(owner, { area: `yg36 ${unique()}`, title: 'promote me' });
  const plain = await createTodo(owner, { area: `yg36 ${unique()}`, title: 'no default' });
  await setEpicPrefix(owner, keyed.epicId, prefix);
  const promote = (id: string, body: unknown = {}, as = headers) => app.request(`/api/todos/${id}/promote`, { method: 'POST', headers: as, body: json(body) });

  expect((await promote(keyed.id, {}, other)).status).toBe(404);
  const promoted = await (await promote(keyed.id)).json();
  expect(promoted.key).toBe(`${prefix}-1`);
  expect((await (await promote(keyed.id, { prefix: 'ZZ' })).json()).key).toBe(`${prefix}-1`); // already keyed: unchanged

  expect((await promote(plain.id)).status).toBe(400); // epic has no default, no prefix given
  expect((await promote(plain.id, { prefix: '9x' })).status).toBe(400);
  expect((await (await promote(plain.id, { prefix: prefix.toLowerCase() })).json()).key).toBe(`${prefix}-2`);
  const activity = await pool.query("SELECT payload FROM activities WHERE subject_id = $1 AND kind = 'issue.updated'", [plain.id]);
  expect(activity.rows[0].payload).toMatchObject({ via: 'ui', changes: ['prefix'] });
});

it('YG-36: prefix settings list epics, set/clear prefixes, and never move a counter backwards', async () => {
  const prefix = prefixOf();
  const todo = await createTodo(owner, { area: `yg36 ${unique()}`, epic: '설정', title: 'x' });
  const put = (body: unknown, as = headers, id = todo.epicId) => app.request(`/api/ticket-prefixes/${id}`, { method: 'PUT', headers: as, body: json(body) });

  expect((await put({ prefix, start: 50 })).status).toBe(200);
  expect(await (await put({ prefix, start: 10 })).json()).toMatchObject({ keyPrefix: prefix, nextNumber: 50 }); // lower start ignored
  expect(await (await put({ prefix, start: 60 })).json()).toMatchObject({ nextNumber: 60 });
  expect((await createTodo(owner, { area: todo.area, epic: '설정', title: 'y' })).key).toBe(`${prefix}-60`);
  expect(await (await put({ prefix })).json()).toMatchObject({ nextNumber: 61 });

  for (const body of [{ prefix: '' }, { prefix: '1A' }, { prefix: 'TOOLONGPREFIX' }, { prefix, start: 0 }, { prefix, start: 1.5 }, {}, { prefix, extra: 1 }])
    expect((await put(body)).status).toBe(400);
  expect((await put({ prefix }, other)).status).toBe(404);

  const list = await (await app.request('/api/ticket-prefixes', { headers })).json();
  expect(list.find((row: { epicId: string }) => row.epicId === todo.epicId)).toMatchObject({ area: todo.area, epic: '설정', keyPrefix: prefix, nextNumber: 61 });
  expect((await (await app.request('/api/ticket-prefixes', { headers: other })).json()).some((row: { epicId: string }) => row.epicId === todo.epicId)).toBe(false);

  expect(await (await put({ prefix: null })).json()).toMatchObject({ keyPrefix: null, nextNumber: null });
  expect((await createTodo(owner, { area: todo.area, epic: '설정', title: 'z' })).key).toBeNull();
  expect((await pool.query('SELECT key FROM issues WHERE epic_id = $1 AND key IS NOT NULL', [todo.epicId])).rows).toEqual([{ key: `${prefix}-60` }]); // existing keys stay
});

it('YG-36: the 0017 seed gives 프로젝트 › yggdrasil the YG default', async () => {
  const user = crypto.randomUUID();
  const todo = await createTodo(user, { area: '프로젝트', epic: 'yggdrasil', title: 'seeded', prefix: null });
  const seed = readFileSync(new URL('../drizzle/0017_epic_key_prefix.sql', import.meta.url), 'utf8').match(/^UPDATE epics[^;]+;/m)![0];
  await pool.query(seed);
  expect((await pool.query('SELECT key_prefix FROM epics WHERE id = $1', [todo.epicId])).rows[0].key_prefix).toBe('YG');
});

// 2026-10-13 23:00 KST
const now = new Date('2026-10-13T14:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const touch = (id: string, at: Date) => pool.query('UPDATE issues SET updated_at = $2 WHERE id = $1', [id, at]);

it('YG-41: stale = todo/doing, overdue ≥ 14 days (all-day by Seoul day, timed by instant) or untouched ≥ 30 days', async () => {
  const user = crypto.randomUUID();
  const make = async (title: string, input: Record<string, unknown> = {}, updated = daysAgo(1)) => {
    const todo = await createTodo(user, { area: '정리', title, ...input });
    await touch(todo.id, updated);
    return todo;
  };
  const allDay = await make('all-day 14일', { dueAt: '2026-09-29' });
  await make('all-day 13일', { dueAt: '2026-09-30' });
  const timed = await make('timed 14일 3시간', { dueAt: '2026-09-29T20:00:00+09:00' });
  await make('timed 13일 23시간', { dueAt: '2026-09-29T23:30:00+09:00' }); // same Seoul day as the stale all-day one
  const doing = await make('진행 중 47일', { status: 'doing' }, daysAgo(47));
  await make('29일', {}, daysAgo(29));
  const both = await make('둘 다', { dueAt: '2026-09-20' }, daysAgo(47));
  await make('보류 + 마감 지남', { dueAt: '2026-09-01', hold: 'waiting' }, daysAgo(5));
  const heldOld = await make('보류 30일', { dueAt: '2026-09-01', hold: 'blocked' }, daysAgo(30));
  await make('백로그', { status: 'backlog', dueAt: '2026-09-01' }, daysAgo(90));
  const done = await make('완료', { dueAt: '2026-09-01' });
  await completeTodo(user, done.id); await touch(done.id, daysAgo(90));
  await make('반복 중', { dueAt: '2026-09-01', recurrence: { freq: 'daily' } }, daysAgo(90));
  const paused = await make('반복 멈춤', { dueAt: '2026-09-01', recurrence: { freq: 'daily', paused: true } }, daysAgo(2));
  const archived = await make('보관', { dueAt: '2026-09-01' });
  await setArchived(user, archived.id, true); await touch(archived.id, daysAgo(90));
  await createTodo(crypto.randomUUID(), { area: '정리', title: '남의 일', dueAt: '2026-09-01' }); // other owner: never listed

  const view = await staleView(user, now);
  expect(view.date).toBe('2026-10-13');
  const byTitle = new Map(view.todos.map((todo) => [todo.title, todo.stale]));
  expect([...byTitle.keys()].sort()).toEqual([allDay, timed, doing, both, heldOld, paused].map((todo) => todo.title).sort());
  expect(byTitle.get(allDay.title)).toEqual({ overdueDays: 14, untouchedDays: null });
  expect(byTitle.get(timed.title)).toEqual({ overdueDays: 14, untouchedDays: null });
  expect(byTitle.get(doing.title)).toEqual({ overdueDays: null, untouchedDays: 47 });
  expect(byTitle.get(heldOld.title)).toEqual({ overdueDays: null, untouchedDays: 30 }); // held: only the untouched rule
  expect(staleReasons(byTitle.get(both.title)!)).toEqual(['마감 23일 지남', '47일 동안 그대로']);
});

it('YG-41: GET /api/todos/stale is owner-scoped and todo://stale + todo://today show it', async () => {
  const mine = await createTodo(owner, { area: `yg41 ${unique()}`, title: '오래된 내 일', dueAt: '2026-01-05' });
  const theirs = await createTodo(crypto.randomUUID(), { area: `yg41 ${unique()}`, title: '오래된 남의 일', dueAt: '2026-01-05' });
  const ids = async (as: typeof headers) => (await (await app.request('/api/todos/stale', { headers: as })).json()).todos.map((todo: { id: string }) => todo.id);
  expect(await ids(headers)).toContain(mine.id);
  expect(await ids(headers)).not.toContain(theirs.id);
  expect(await ids(other)).not.toContain(mine.id); // owner two stays empty: planning.test expects no rows for it
  expect((await app.request('/api/todos/stale')).status).toBe(401);

  const user = crypto.randomUUID();
  const old = await createTodo(user, { area: '정리', title: '잊힌 일', dueAt: '2026-01-05', prefix: 'OLD' });
  await createTodo(user, { area: '정리', title: '오늘 일', priority: 'p1' });
  await touch(old.id, new Date(Date.now() - 47 * 86_400_000));
  const mcp = await connect(user);
  try {
    const stale = await mcp.read('todo://stale');
    expect(stale).toMatch(/^# 방치된 할 일 \(\d{4}-\d{2}-\d{2}\)/);
    expect(stale).toContain(`OLD-1: 잊힌 일`);
    expect(stale).toMatch(/마감 \d+일 지남 · 47일 동안 그대로/);
    expect(stale).not.toContain('오늘 일');
    expect((await mcp.read('todo://today')).split('\n')[0]).toMatch(/^# 오늘 할 일 \(\d{4}-\d{2}-\d{2}\) · 방치 1건$/);
  } finally { await mcp.close(); }
});
