import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app as httpApp, createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { issuePat } from '../src/server/pats.js';
import { calendarView, createTodo, listAreaTodos, todayView } from '../src/server/todos.js';
import { listIssues } from '../src/server/work.js';
import { planningTree } from '../src/server/planning.js';
import { searchWorkspace } from '../src/server/search.js';

// YG-39 get/list/archive + key refs, YG-40 create_todos, YG-35 read_planning_tree notes and lock-free parallel creates.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });
const kst = (local: string) => new Date(`${local}+09:00`);

async function connect(owner: string) {
  const token = (await issuePat(owner, 'yg39')).token;
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg39-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0]!.text;
    return result.isError ? { error: text } : JSON.parse(text);
  };
  return { client, call, close };
}
async function snapshot(owner: string) {
  return Promise.all(['goals', 'epics', 'issues', 'activities', 'recurrences', 'ticket_counters'].map(async (table) => (await pool.query(`SELECT row_to_json(t)::text AS row FROM ${table} t WHERE owner_id = $1 ORDER BY 1`, [owner])).rows));
}

it('create_todos writes all items in order with sequential keys in one transaction, or nothing with per-item errors', async () => {
  const owner = crypto.randomUUID();
  const { call, close } = await connect(owner);
  try {
    await call('create_todo', { area: '배치', title: '먼저', prefix: 'BT' });
    const created = await call('create_todos', { items: [
      { area: '배치', title: '하나', prefix: 'bt', dueAt: '2026-10-20' },
      { area: '새 영역', epic: '새 묶음', title: '둘', priority: 'p1' },
      { area: '배치', title: '셋', prefix: 'BT', recurrence: { freq: 'weekly', weekdays: ['mon'] } },
      { area: '배치', title: '넷', prefix: 'BT', status: 'doing' }
    ] });
    expect(created.map((todo: { title: string }) => todo.title)).toEqual(['하나', '둘', '셋', '넷']);
    expect(created.map((todo: { key: string | null }) => todo.key)).toEqual(['BT-2', null, 'BT-3', 'BT-4']);
    expect(created[0]).toMatchObject({ dueAllDay: true, area: '배치', epic: '일반' });
    expect(created[1]).toMatchObject({ area: '새 영역', epic: '새 묶음', priority: 'p1' });
    expect(created[2].recurrence).toMatchObject({ freq: 'weekly', weekdays: ['mon'], paused: false });
    expect(created[3].status).toBe('doing');
    const activities = (await pool.query("SELECT subject_id, payload FROM activities WHERE owner_id = $1 AND kind = 'issue.created'", [owner])).rows;
    expect(activities).toHaveLength(5);
    expect(activities.every((row) => row.payload.via === 'mcp')).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM goals WHERE owner_id = $1', [owner])).rows[0].n).toBe(2);

    const before = await snapshot(owner);
    const bad = await call('create_todos', { items: [{ area: '배치', title: '좋음', prefix: 'BT' }, { area: '배치', title: '' }, { area: '배치', title: 'x', dueAt: 'tomorrow' }] });
    // One line per bad item, with its index.
    expect(bad.error).toMatch(/at items\[1\]\.title/);
    expect(bad.error).toMatch(/at items\[2\]\.dueAt/);
    expect(bad.error).not.toMatch(/items\[0\]/);
    expect((await call('create_todos', { items: [] })).error).toBeTruthy();
    expect((await call('create_todos', { items: Array.from({ length: 51 }, (_, i) => ({ area: '배치', title: `t${i}` })) })).error).toBeTruthy();
    // A database failure mid-batch rolls back everything, including the key counter.
    await pool.query(`CREATE OR REPLACE FUNCTION yg40_fail() RETURNS trigger AS $$ BEGIN IF NEW.owner_id = '${owner}' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await pool.query('CREATE TRIGGER yg40_fail BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION yg40_fail()');
    try {
      expect((await call('create_todos', { items: [{ area: '롤백 영역', title: 'a', prefix: 'BT' }, { area: '배치', title: 'b', prefix: 'BT' }] })).error).toBe('Operation failed. Please try again.');
    } finally { await pool.query('DROP TRIGGER yg40_fail ON activities; DROP FUNCTION yg40_fail()'); }
    expect(await snapshot(owner)).toEqual(before);
    expect((await call('create_todos', { items: [{ area: '배치', title: '다음', prefix: 'BT' }] }))[0].key).toBe('BT-5');
  } finally { await close(); }
});

it('get_todo / update_todo / complete_todo accept a case-insensitive key, only within the owner', async () => {
  const owner = crypto.randomUUID();
  const intruder = crypto.randomUUID();
  const todo = await createTodo(owner, { area: '키', title: '키로 찾기', prefix: 'KY', notes: 'x'.repeat(300) });
  const mine = await connect(owner);
  const theirs = await connect(intruder);
  try {
    expect(todo.key).toBe('KY-1');
    expect(await mine.call('get_todo', { key: 'ky-1' })).toMatchObject({ id: todo.id, notes: 'x'.repeat(300) });
    expect(await mine.call('get_todo', { id: todo.id })).toMatchObject({ key: 'KY-1' });
    expect(await mine.call('update_todo', { key: 'Ky-1', priority: 'p1' })).toMatchObject({ id: todo.id, priority: 'p1' });
    for (const [name, args] of [['get_todo', {}], ['get_todo', { id: todo.id, key: 'KY-1' }], ['get_todo', { key: 'KY' }], ['update_todo', { key: 'KY-1' }],
      ['update_todo', { id: todo.id, key: 'KY-1', title: 'x' }], ['complete_todo', {}], ['archive_todo', { id: todo.id, key: 'KY-1' }]] as const)
      expect((await mine.call(name, args)).error, `${name} ${JSON.stringify(args)}`).toBeTruthy();
    expect((await mine.call('get_todo', { key: 'KY-99' })).error).toBe('Not found');
    const before = await snapshot(owner);
    for (const name of ['get_todo', 'update_todo', 'complete_todo', 'archive_todo', 'unarchive_todo'])
      expect((await theirs.call(name, name === 'update_todo' ? { key: 'KY-1', title: 'stolen' } : { key: 'KY-1' })).error, name).toBe('Not found');
    expect(await snapshot(owner)).toEqual(before);
    expect(await mine.call('complete_todo', { key: 'KY-1', completedAt: '2026-10-01' })).toMatchObject({ status: 'done', completedAt: kst('2026-10-01T12:00:00').toISOString() });
    expect((await mine.call('complete_todo', { key: 'KY-1', completedAt: '2999-01-01' })).error).toMatch(/future/);
  } finally { await mine.close(); await theirs.close(); }
});

it('list_todos filters, pages and stays compact', async () => {
  const owner = crypto.randomUUID();
  const make = (title: string, extra: Record<string, unknown> = {}) => createTodo(owner, { area: '목록', title, ...extra });
  const a = await make('알파 보고서', { dueAt: '2026-10-13', prefix: 'LS', notes: 'n'.repeat(200) });
  const b = await make('베타', { dueAt: '2026-10-20T09:00:00+09:00', hold: 'waiting', holdReason: '답장' });
  const c = await createTodo(owner, { area: '다른', epic: '묶음', title: '감마', status: 'backlog' });
  const d1 = await make('끝1', { status: 'done' });
  const d2 = await make('끝2', { status: 'done' });
  await pool.query("UPDATE issues SET completed_at = '2026-10-01T00:00:00Z' WHERE id = $1", [d2.id]);
  await pool.query("UPDATE issues SET completed_at = '2026-10-05T00:00:00Z' WHERE id = $1", [d1.id]);
  await createTodo(crypto.randomUUID(), { area: '목록', title: '남의 알파' });
  const { call, close } = await connect(owner);
  const ids = (page: { todos: { id: string }[] }) => page.todos.map((todo) => todo.id);
  try {
    const all = await call('list_todos');
    expect(ids(all).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(all.nextCursor).toBeNull();
    const first = all.todos.find((todo: { id: string }) => todo.id === a.id);
    expect(first).toMatchObject({ key: 'LS-1', area: '목록', epic: '일반', dueAllDay: true });
    expect(first.notes).toHaveLength(121);
    for (const field of ['position', 'epicId', 'createdAt', 'holdReason', 'scheduledAt']) expect(first).not.toHaveProperty(field);
    expect((await call('list_todos', { includeNotes: true })).todos.find((todo: { id: string }) => todo.id === a.id).notes).toHaveLength(200);
    expect(ids(await call('list_todos', { status: ['done'] }))).toEqual([d1.id, d2.id]); // newest completion first
    expect(ids(await call('list_todos', { area: '다른', epic: '묶음' }))).toEqual([c.id]);
    expect(ids(await call('list_todos', { hold: 'waiting' }))).toEqual([b.id]);
    expect(ids(await call('list_todos', { hold: 'none' })).sort()).toEqual([a.id, c.id].sort());
    expect(ids(await call('list_todos', { dueBefore: '2026-10-20' }))).toEqual([a.id]);
    expect(ids(await call('list_todos', { dueAfter: '2026-10-13' })).sort()).toEqual([a.id, b.id].sort());
    expect(ids(await call('list_todos', { dueAfter: '2026-10-14', dueBefore: '2026-10-20T09:00:01+09:00' }))).toEqual([b.id]);
    expect(ids(await call('list_todos', { hasKey: true }))).toEqual([a.id]);
    expect(ids(await call('list_todos', { q: 'ls-1' }))).toEqual([a.id]);
    expect(ids(await call('list_todos', { q: '알파' }))).toEqual([a.id]);
    const page1 = await call('list_todos', { limit: 2 });
    const page2 = await call('list_todos', { limit: 2, cursor: page1.nextCursor });
    expect([...ids(page1), ...ids(page2)]).toEqual(ids(all));
    expect(page2.nextCursor).toBeNull();
    for (const args of [{ limit: 0 }, { limit: 201 }, { status: ['open'] }, { cursor: 'abc' }, { dueBefore: 'soon' }, { other: 1 }])
      expect((await call('list_todos', args)).error, JSON.stringify(args)).toBeTruthy();
  } finally { await close(); }
});

it('archive_todo hides a todo everywhere until unarchived, logging via=mcp; there is still no delete tool', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(kst('2026-10-13T09:00:00'));
  const owner = crypto.randomUUID();
  installTestOwner(`yg39-${owner}`, { id: owner });
  const headers = { authorization: `Bearer yg39-${owner}` };
  const hidden = await createTodo(owner, { area: '보관', title: '보관할 일 zq39', dueAt: '2026-10-13', priority: 'p1', prefix: 'AR' });
  const series = await createTodo(owner, { area: '보관', title: '보관할 반복 zq39', recurrence: { freq: 'daily' } });
  const undated = await createTodo(owner, { area: '보관', title: '날짜 없음 zq39' });
  const kept = await createTodo(owner, { area: '보관', title: '남길 일 zq39', dueAt: '2026-10-13' });
  const archivedIds = [hidden.id, series.id, undated.id];
  const { client, call, close } = await connect(owner);
  try {
    expect((await client.listTools()).tools.map((tool) => tool.name).filter((name) => /delete|remove/.test(name))).toEqual([]);
    expect(await call('archive_todo', { key: 'ar-1' })).toMatchObject({ id: hidden.id, archivedAt: expect.any(String) });
    await call('archive_todo', { id: series.id });
    await call('archive_todo', { id: undated.id });
    await call('archive_todo', { id: undated.id }); // idempotent: no second activity

    const visible = async () => {
      const today = await todayView(owner);
      const calendar = await calendarView(owner, '2026-10-01', '2026-10-31');
      const board = await (await httpApp.request('/api/issues', { headers })).json();
      const tree = await planningTree(owner);
      const resource = (await client.readResource({ uri: `todo://area/${encodeURIComponent('보관')}` })).contents[0] as { text: string };
      return [
        ...today.today, ...today.overdue, ...today.week, ...calendar.todos, ...calendar.undated, ...calendar.ghosts.map((ghost) => ({ id: ghost.todoId })),
        ...board, ...tree.flatMap((goal) => goal.epics.flatMap((epic) => epic.issues)), ...await listAreaTodos(owner, '보관'),
        ...(await searchWorkspace(owner, 'zq39')), ...(await call('list_todos')).todos, ...(await listIssues(owner))
      ].map((item: { id: string }) => item.id).concat(archivedIds.filter((id) => resource.text.includes(id)));
    };
    const shown = await visible();
    for (const id of archivedIds) expect(shown, id).not.toContain(id);
    expect(shown).toContain(kept.id);
    expect((await call('list_todos', { includeArchived: true })).todos.map((todo: { id: string }) => todo.id)).toEqual(expect.arrayContaining(archivedIds));
    expect(await call('get_todo', { id: hidden.id })).toMatchObject({ archivedAt: expect.any(String) });

    expect(await call('unarchive_todo', { key: 'AR-1' })).toMatchObject({ id: hidden.id, archivedAt: null });
    expect(await visible()).toContain(hidden.id);
    const log = (await pool.query("SELECT kind, payload FROM activities WHERE owner_id = $1 AND kind LIKE 'issue.%archived' ORDER BY created_at, kind", [owner])).rows;
    expect(log.map((row) => [row.kind, row.payload.via])).toEqual([['issue.archived', 'mcp'], ['issue.archived', 'mcp'], ['issue.archived', 'mcp'], ['issue.unarchived', 'mcp']]);
    expect((await pool.query('SELECT count(*)::int AS n FROM issues WHERE owner_id = $1', [owner])).rows[0].n).toBe(4);
  } finally { await close(); }
});

it('read_planning_tree clips notes unless includeNotes; parallel creates into a new area share one Goal/Epic and unique keys', async () => {
  const owner = crypto.randomUUID();
  const { call, close } = await connect(owner);
  try {
    const created = await Promise.all(Array.from({ length: 10 }, (_, i) => call('create_todo', { area: '병렬', epic: '동시', title: `p${i}`, prefix: 'PL', notes: 'm'.repeat(150) })));
    expect(new Set(created.map((todo: { key: string }) => todo.key)).size).toBe(10);
    expect(new Set(created.map((todo: { epicId: string }) => todo.epicId)).size).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM goals WHERE owner_id = $1', [owner])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM epics WHERE owner_id = $1', [owner])).rows[0].n).toBe(1);
    const notes = (tree: { epics: { issues: { notes: string }[] }[] }[]) => tree.flatMap((goal) => goal.epics.flatMap((epic) => epic.issues.map((issue) => issue.notes.length)));
    expect(new Set(notes(await call('read_planning_tree')))).toEqual(new Set([121]));
    expect(new Set(notes(await call('read_planning_tree', { includeNotes: true })))).toEqual(new Set([150]));
  } finally { await close(); }
});
