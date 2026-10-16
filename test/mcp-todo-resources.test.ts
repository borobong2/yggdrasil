import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { issuePat } from '../src/server/pats.js';
import { completeTodo, createTodo, todayView } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); });

async function connect(owner: string) {
  const token = (await issuePat(owner, 'resources')).token;
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const client = new Client({ name: 'yg15-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  const read = async (uri: string) => {
    const { contents } = await client.readResource({ uri });
    expect(contents[0]).toMatchObject({ uri, mimeType: 'text/markdown' });
    return (contents[0] as { text: string }).text;
  };
  return { client, close, read };
}
async function activityCount(owner: string) {
  return (await pool.query('SELECT count(*)::int AS n FROM activities WHERE owner_id = $1', [owner])).rows[0].n;
}

it('serves today/overdue/waiting/area/issue as read-only markdown on Asia/Seoul dates', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-11T15:30:00Z')); // 2026-10-12 00:30 KST
  const owner = crypto.randomUUID();
  const dueToday = await createTodo(owner, { area: '잡일', title: '가계부 정리', dueAt: '2026-10-12', priority: 'p2', notes: '카드값 포함' });
  const overdue = await createTodo(owner, { area: '잡일', title: '어제 마감', dueAt: new Date('2026-10-11T14:59:00Z') });
  await createTodo(owner, { area: '커리어', epic: '백엔드', title: '내일 마감', dueAt: '2026-10-13' });
  await createTodo(owner, { area: '커리어', title: '추천인 답장', hold: 'waiting', holdReason: '메일 보냄', priority: 'p1' });
  const done = await createTodo(owner, { area: '잡일', title: '끝난 일', dueAt: '2026-10-01' });
  await completeTodo(owner, done.id);
  await createTodo(crypto.randomUUID(), { area: '잡일', title: '남의 일', priority: 'p1', dueAt: '2026-10-12' });
  const before = await activityCount(owner);

  const { client, close, read } = await connect(owner);
  try {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toEqual(expect.arrayContaining(['todo://today', 'todo://overdue', 'todo://waiting', `todo://area/${encodeURIComponent('잡일')}`, `todo://area/${encodeURIComponent('커리어')}`]));
    expect((await client.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate).sort()).toEqual(['todo://area/{name}', 'todo://history/{id}', 'todo://issue/{id}']);

    const today = await read('todo://today');
    expect(today).toContain('2026-10-12');
    expect(today).toContain('가계부 정리');
    expect(today).toContain(dueToday.id);
    // YG-54: sectioned like the web 오늘 screen — the timed todo due last night is 밀린 일, not today's work.
    const [todayPart, latePart] = today.split('## 밀린 일');
    expect(todayPart).toContain('## 오늘 할 일');
    expect(todayPart).toContain('가계부 정리');
    expect(todayPart).not.toContain('어제 마감');
    expect(latePart).toContain('어제 마감');
    expect(latePart).toContain('## 예정');
    for (const hidden of ['내일 마감', '추천인 답장']) { expect(todayPart).not.toContain(hidden); expect(today.split('## 예정')[1]).toContain(hidden); }
    for (const hidden of ['끝난 일', '남의 일']) expect(today).not.toContain(hidden);

    const late = await read('todo://overdue');
    expect(late).toContain('어제 마감');
    expect(late).toContain('마감 2026-10-11 23:59'); // YG-38: timed shows its Seoul time
    expect(late).not.toContain('가계부 정리');

    const waiting = await read('todo://waiting');
    expect(waiting).toContain('추천인 답장');
    expect(waiting).toContain('메일 보냄');

    const area = await read(`todo://area/${encodeURIComponent('커리어')}`);
    expect(area).toContain('내일 마감');
    expect(area).toMatch(/내일 마감 — .*마감 2026-10-13 \(id/); // all-day: date only
    expect(area).toContain('백엔드');
    expect(area).toContain('추천인 답장');
    expect(area).not.toContain('가계부');

    const detail = await read(`todo://issue/${dueToday.id}`);
    expect(detail).toContain('# 가계부 정리');
    expect(detail).toContain('카드값 포함');
    expect(detail).toContain('P2');
    expect(await read(`todo://issue/${overdue.id}`)).toContain('2026-10-11');

    expect(await activityCount(owner)).toBe(before);
  } finally { await close(); }
});

it('shows empty states and hides other owners’ todos and areas', async () => {
  const owner = crypto.randomUUID();
  const foreign = await createTodo(crypto.randomUUID(), { area: '비밀', title: '남의 할 일', priority: 'p1', hold: 'waiting' });
  const { client, close, read } = await connect(owner);
  try {
    for (const uri of ['todo://today', 'todo://overdue', 'todo://waiting', `todo://area/${encodeURIComponent('비밀')}`]) {
      const text = await read(uri);
      expect(text).toContain('없음');
      expect(text).not.toContain('남의 할 일');
    }
    expect((await client.listResources()).resources.map((r) => r.uri)).not.toContain(`todo://area/${encodeURIComponent('비밀')}`);
    await expect(client.readResource({ uri: `todo://issue/${foreign.id}` })).rejects.toThrow(/not found/i);
    await expect(client.readResource({ uri: 'todo://issue/not-a-uuid' })).rejects.toThrow(/not found/i);
  } finally { await close(); }
});

it('YG-54: a past-due backlog todo is not today — on the server and in todo://today — while a past-due todo still is 밀린 일', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T01:00:00Z')); // 2026-10-17 10:00 KST
  const owner = crypto.randomUUID();
  const shelved = await createTodo(owner, { area: '잡일', title: '오래된 백로그', status: 'backlog', dueAt: '2026-05-01' });
  const late = await createTodo(owner, { area: '잡일', title: '지난주 마감', status: 'todo', dueAt: '2026-10-10' });
  const view = await todayView(owner);
  expect(view.today.map((todo) => todo.id)).toEqual([late.id]);
  expect(view.late.map((todo) => todo.id)).toEqual([late.id]);
  expect(view.overdue.map((todo) => todo.id).sort()).toEqual([shelved.id, late.id].sort());
  const { close, read } = await connect(owner);
  try {
    const [todayPart, latePart] = (await read('todo://today')).split('## 밀린 일');
    expect(todayPart).not.toContain('오래된 백로그');
    expect(todayPart).not.toContain('지난주 마감');
    expect(latePart).toContain('지난주 마감');
    expect(latePart).not.toContain('오래된 백로그');
    expect(await read('todo://overdue')).toContain('오래된 백로그');
  } finally { await close(); }
});
