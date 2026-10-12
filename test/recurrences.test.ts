import { createHmac } from 'node:crypto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { issuePat } from '../src/server/pats.js';
import { firstSlot, nextSlot } from '../src/server/recurrences.js';
import { completeTodo, createTodo, getTodo, updateTodo } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp();
afterAll(() => pool.end());
afterEach(() => { vi.useRealTimers(); delete process.env.GITHUB_WEBHOOK_SECRET; });

const kst = (local: string) => new Date(`${local}+09:00`);
const at = (local: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(kst(local)); };
const owner = () => { const id = crypto.randomUUID(); installTestOwner(`yg28-${id}`, { id }); return { id, headers: { authorization: `Bearer yg28-${id}`, 'content-type': 'application/json' } }; };
async function series(recurrenceId: string) {
  return (await pool.query('SELECT id, status, due_at FROM issues WHERE recurrence_id = $1 ORDER BY due_at, id', [recurrenceId])).rows as { id: string; status: string; due_at: Date }[];
}
const open = async (recurrenceId: string) => (await series(recurrenceId)).filter((row) => row.status !== 'done');

it('computes next slots in Asia/Seoul: weekly multi-day, month end, strict after, KST day boundary', () => {
  const weekly = { freq: 'weekly' as const, weekdays: ['mon' as const, 'wed' as const], monthDay: null, time: '10:00' };
  expect(nextSlot(weekly, kst('2026-10-12T10:00:00'))).toEqual(kst('2026-10-14T10:00:00')); // Mon 10:00 itself is not "after"
  expect(nextSlot(weekly, kst('2026-10-12T09:59:00'))).toEqual(kst('2026-10-12T10:00:00'));
  expect(nextSlot(weekly, kst('2026-10-14T21:00:00'))).toEqual(kst('2026-10-19T10:00:00'));
  const monthly = { freq: 'monthly' as const, weekdays: null, monthDay: 31, time: null };
  expect(nextSlot(monthly, kst('2026-02-01T00:00:00'))).toEqual(kst('2026-02-28T00:00:00'));
  expect(nextSlot(monthly, kst('2026-02-28T00:00:00'))).toEqual(kst('2026-03-31T00:00:00'));
  expect(nextSlot(monthly, kst('2028-02-10T00:00:00'))).toEqual(kst('2028-02-29T00:00:00'));
  expect(nextSlot({ ...monthly, monthDay: 15 }, kst('2026-10-15T00:00:00'))).toEqual(kst('2026-11-15T00:00:00'));
  const daily = { freq: 'daily' as const, weekdays: null, monthDay: null, time: null };
  // 00:30 KST on Oct 13 is still Oct 12 in UTC; the next all-day slot is Oct 14 in Seoul.
  expect(nextSlot(daily, new Date('2026-10-12T15:30:00Z'))).toEqual(kst('2026-10-14T00:00:00'));
  expect(firstSlot(daily, new Date('2026-10-12T15:30:00Z'))).toEqual(kst('2026-10-13T00:00:00'));
  expect(firstSlot({ ...daily, time: '07:00' }, kst('2026-10-13T08:00:00'))).toEqual(kst('2026-10-14T07:00:00'));
});

it('seed scenario: weekly study with a one-off exception, then exactly one next occurrence on complete', async () => {
  const me = crypto.randomUUID();
  at('2026-10-12T08:00:00');
  const study = await createTodo(me, { area: '국민대', title: '제2의 월급 스터디', recurrence: { freq: 'weekly', weekdays: ['mon'], time: '10:00' } });
  expect(study).toMatchObject({ dueAt: kst('2026-10-12T10:00:00').toISOString(), recurrence: { freq: 'weekly', weekdays: ['mon'], monthDay: null, time: '10:00', paused: false } });
  const rule = study.recurrence!;
  // This week only: Mon 10:00 → Tue 21:00. The rule stays Mon 10:00.
  const moved = await updateTodo(me, study.id, { dueAt: '2026-10-13T21:00:00+09:00' });
  expect(moved.dueAt).toBe(kst('2026-10-13T21:00:00').toISOString());
  expect(moved.recurrence).toEqual(rule);

  at('2026-10-13T22:30:00');
  await completeTodo(me, study.id);
  await completeTodo(me, study.id); // idempotent
  const rows = await series(rule.id);
  expect(rows.map((row) => [row.status, row.due_at.toISOString()])).toEqual([['done', kst('2026-10-13T21:00:00').toISOString()], ['todo', kst('2026-10-19T10:00:00').toISOString()]]);
  const next = await getTodo(me, rows[1]!.id);
  expect(next).toMatchObject({ title: '제2의 월급 스터디', area: '국민대', recurrence: rule, status: 'todo' });
  const created = (await pool.query("SELECT payload FROM activities WHERE subject_id = $1 AND kind = 'issue.created'", [next.id])).rows;
  expect(created).toEqual([{ payload: { via: 'ui', recurrenceId: rule.id, previousId: study.id } }]);

  at('2026-10-13T12:00:00');
  const deep = await createTodo(me, { area: '국민대', title: '딥러닝 스터디', recurrence: { freq: 'weekly', weekdays: ['wed'], time: '20:00' } });
  expect(deep.dueAt).toBe(kst('2026-10-14T20:00:00').toISOString());
});

it('skips missed slots, completes early without repeating the same slot, and keeps one open occurrence', async () => {
  const me = crypto.randomUUID();
  at('2026-09-01T09:00:00');
  const todo = await createTodo(me, { area: '루틴', title: '물 주기', recurrence: { freq: 'daily' } });
  expect(todo.dueAt).toBe(kst('2026-09-01T00:00:00').toISOString());
  at('2026-10-13T09:00:00'); // six weeks late
  await completeTodo(me, todo.id);
  expect((await open(todo.recurrence!.id)).map((row) => row.due_at.toISOString())).toEqual([kst('2026-10-14T00:00:00').toISOString()]);

  const early = await createTodo(me, { area: '루틴', title: '월세', dueAt: '2026-10-25', recurrence: { freq: 'monthly', monthDay: 25 } });
  await completeTodo(me, early.id); // done on Oct 13, before its Oct 25 slot
  expect((await open(early.recurrence!.id)).map((row) => row.due_at.toISOString())).toEqual([kst('2026-11-25T00:00:00').toISOString()]);

  // Concurrent completes of the same occurrence still leave exactly one open next occurrence.
  const [next] = await open(early.recurrence!.id);
  await Promise.all([completeTodo(me, next!.id), completeTodo(me, next!.id), updateTodo(me, next!.id, { status: 'done' })]);
  expect(await open(early.recurrence!.id)).toHaveLength(1);
});

it('pauses, resumes and ends a series; rule edits only affect future occurrences', async () => {
  const me = crypto.randomUUID();
  at('2026-10-13T09:00:00');
  const todo = await createTodo(me, { area: '루틴', title: '운동', recurrence: { freq: 'weekly', weekdays: ['tue', 'thu'], time: '07:00' } });
  const id = todo.recurrence!.id;
  expect(todo.dueAt).toBe(kst('2026-10-15T07:00:00').toISOString());
  const paused = await updateTodo(me, todo.id, { recurrence: { freq: 'weekly', weekdays: ['tue', 'thu'], time: '07:00', paused: true } });
  expect(paused).toMatchObject({ dueAt: todo.dueAt, recurrence: { id, paused: true } });
  await completeTodo(me, todo.id);
  expect(await open(id)).toEqual([]);
  // Resuming on the done occurrence rolls the series forward once.
  const resumed = await updateTodo(me, todo.id, { recurrence: { freq: 'weekly', weekdays: ['fri'], time: '07:00' } });
  expect(resumed.recurrence).toMatchObject({ id, weekdays: ['fri'], paused: false });
  const [next] = await open(id);
  expect(next!.due_at).toEqual(kst('2026-10-16T07:00:00'));
  await updateTodo(me, todo.id, { recurrence: { freq: 'weekly', weekdays: ['fri'], time: '07:00' } });
  expect(await open(id)).toHaveLength(1);

  const ended = await updateTodo(me, next!.id, { recurrence: null });
  expect(ended.recurrence).toBeNull();
  expect((await pool.query('SELECT count(*)::int AS n FROM recurrences WHERE id = $1', [id])).rows[0].n).toBe(0);
  expect((await pool.query('SELECT count(*)::int AS n FROM issues WHERE id = ANY($1) AND recurrence_id IS NULL', [[todo.id, next!.id]])).rows[0].n).toBe(2);
  await completeTodo(me, next!.id);
  expect((await pool.query("SELECT count(*)::int AS n FROM issues WHERE owner_id = $1 AND status <> 'done'", [me])).rows[0].n).toBe(0);
});

it('rolls the series on board moves, planning status changes and GitHub merges', async () => {
  const me = owner();
  const board = await createTodo(me.id, { area: '루틴', title: 'board', recurrence: { freq: 'daily', time: '09:00' } });
  expect((await app.request(`/api/issues/${board.id}/move`, { method: 'PATCH', headers: me.headers, body: JSON.stringify({ status: 'done', position: 0 }) })).status).toBe(200);
  expect(await open(board.recurrence!.id)).toHaveLength(1);
  const planning = await createTodo(me.id, { area: '루틴', title: 'planning', recurrence: { freq: 'daily' } });
  expect((await app.request(`/api/issues/${planning.id}`, { method: 'PATCH', headers: me.headers, body: JSON.stringify({ status: 'done' }) })).status).toBe(200);
  expect(await open(planning.recurrence!.id)).toHaveLength(1);
  const listed = await (await app.request('/api/issues', { headers: me.headers })).json() as { id: string; recurrence: unknown }[];
  expect(listed.find((row) => row.id === board.id)?.recurrence).toMatchObject({ freq: 'daily', time: '09:00' });

  process.env.GITHUB_WEBHOOK_SECRET = 'yg28-secret';
  const repo = `borobong2/yg28-${crypto.randomUUID().slice(0, 8)}`;
  expect((await app.request('/api/github/repos', { method: 'POST', headers: me.headers, body: JSON.stringify({ fullName: repo, prefix: 'RT' }) })).status).toBe(201);
  const ticket = await createTodo(me.id, { area: '개발', title: 'weekly release', prefix: 'RT', recurrence: { freq: 'weekly', weekdays: ['fri'] } });
  const body = JSON.stringify({ action: 'closed', repository: { full_name: repo }, pull_request: { number: 1, html_url: `https://github.com/${repo}/pull/1`, title: `${ticket.key}: release`, body: '', state: 'closed', merged: true, head: { ref: 'release', sha: 'a'.repeat(40) }, merge_commit_sha: 'b'.repeat(40) } });
  const hook = await app.request('/api/webhooks/github', { method: 'POST', body, headers: { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': crypto.randomUUID(), 'x-hub-signature-256': `sha256=${createHmac('sha256', 'yg28-secret').update(body).digest('hex')}` } });
  expect(hook.status).toBe(200);
  expect((await series(ticket.recurrence!.id)).map((row) => row.status)).toEqual(['done', 'todo']);
});

it('isolates series by owner', async () => {
  const [me, intruder] = [crypto.randomUUID(), crypto.randomUUID()];
  const todo = await createTodo(me, { area: '루틴', title: 'mine', recurrence: { freq: 'daily' } });
  await expect(updateTodo(intruder, todo.id, { recurrence: null })).rejects.toThrow();
  await expect(updateTodo(intruder, todo.id, { recurrence: { freq: 'monthly', monthDay: 1 } })).rejects.toThrow();
  await expect(completeTodo(intruder, todo.id)).rejects.toThrow();
  expect((await getTodo(me, todo.id)).recurrence).toEqual(todo.recurrence);
  expect((await pool.query('SELECT count(*)::int AS n FROM recurrences WHERE owner_id = $1', [intruder])).rows[0].n).toBe(0);
});

it('accepts recurrence over MCP, validates it, and shows the rule in resources', async () => {
  const me = crypto.randomUUID();
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg28-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${(await issuePat(me, 'yg28')).token}` } } }));
  try {
    for (const recurrence of [{ freq: 'weekly' }, { freq: 'weekly', weekdays: [] }, { freq: 'weekly', weekdays: ['monday'] }, { freq: 'daily', weekdays: ['mon'] }, { freq: 'monthly' },
      { freq: 'monthly', monthDay: 0 }, { freq: 'monthly', monthDay: 32 }, { freq: 'daily', time: '25:00' }, { freq: 'daily', time: '9:00' }, { freq: 'yearly' }, { freq: 'daily', every: 2 }]) {
      expect((await client.callTool({ name: 'create_todo', arguments: { area: '루틴', title: 'bad', recurrence } })).isError, JSON.stringify(recurrence)).toBe(true);
    }
    expect((await pool.query('SELECT count(*)::int AS n FROM issues WHERE owner_id = $1', [me])).rows[0].n).toBe(0);
    const created = JSON.parse(((await client.callTool({ name: 'create_todo', arguments: { area: '국민대', title: '딥러닝 스터디', recurrence: { freq: 'weekly', weekdays: ['wed'], time: '20:00' } } })).content as { text: string }[])[0]!.text);
    expect(created.recurrence).toMatchObject({ freq: 'weekly', weekdays: ['wed'], time: '20:00' });
    const updated = await client.callTool({ name: 'update_todo', arguments: { id: created.id, recurrence: { freq: 'monthly', monthDay: 31, paused: true } } });
    expect(JSON.parse((updated.content as { text: string }[])[0]!.text).recurrence).toMatchObject({ id: created.recurrence.id, freq: 'monthly', monthDay: 31, weekdays: null, time: null, paused: true });
    const text = (uri: string) => client.readResource({ uri }).then((result) => (result.contents[0] as { text: string }).text);
    expect(await text(`todo://issue/${created.id}`)).toContain('- 반복: 매월 31일 (일시정지)');
    expect(await text(`todo://area/${encodeURIComponent('국민대')}`)).toContain('반복 매월 31일 (일시정지)');
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
