import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { connectRepo, handleGitHubEvent } from '../src/server/github.js';
import { issuePat } from '../src/server/pats.js';
import { bulkUpdateTodos } from '../src/server/todo-bulk.js';
import { completeTodo, createTodo, updateTodo } from '../src/server/todos.js';
import { moveIssue } from '../src/server/board.js';

// YG-44 get_history / todo://history + field diffs in activity payloads + GitHub summary on get_todo/list_todos.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

async function connect(owner: string) {
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg44-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${(await issuePat(owner, 'yg44')).token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { text: string }[])[0]!.text;
    return result.isError ? { error: text } : JSON.parse(text);
  };
  const read = async (uri: string) => ((await client.readResource({ uri })).contents[0] as { text: string }).text;
  return { call, read, close };
}
const diffs = async (id: string) => (await pool.query('SELECT kind, payload FROM activities WHERE subject_id = $1 ORDER BY created_at, id', [id])).rows;

it('records field diffs for update, complete and bulk, keeping the changes list', async () => {
  const owner = crypto.randomUUID();
  const todo = await createTodo(owner, { area: '개발', title: '이력', priority: 'p3', dueAt: '2026-10-20' });
  await updateTodo(owner, todo.id, { priority: 'p1', dueAt: '2026-10-22', area: '커리어', title: '이력' }, 'mcp');
  await completeTodo(owner, todo.id, 'mcp');
  const other = await createTodo(owner, { area: '개발', title: '일괄' });
  await bulkUpdateTodos(owner, { action: 'hold', ids: [other.id], hold: 'waiting', holdReason: '답장' });

  const [, updated, completed] = await diffs(todo.id);
  expect(updated.payload).toMatchObject({ via: 'mcp', changes: ['priority', 'dueAt', 'area', 'title'], diff: { priority: ['p3', 'p1'], dueAt: ['2026-10-20', '2026-10-22'], area: ['개발', '커리어'] } });
  expect(updated.payload.diff).not.toHaveProperty('title'); // unchanged value is not a diff
  expect(completed).toMatchObject({ kind: 'issue.completed', payload: { changes: ['status'], diff: { status: ['todo', 'done'] } } });
  expect((await diffs(other.id))[1].payload).toMatchObject({ via: 'ui', bulk: 'hold', changes: ['hold', 'holdReason'], diff: { hold: [null, 'waiting'], holdReason: [null, '답장'] } });
});

it('get_history by key, id and document, with filters, Korean labels and owner isolation', async () => {
  const owner = crypto.randomUUID();
  const stranger = crypto.randomUUID();
  const me = await connect(owner);
  const them = await connect(stranger);
  try {
    const todo = await me.call('create_todo', { area: '개발', title: '히스토리', prefix: 'HI' });
    await me.call('update_todo', { key: 'HI-1', status: 'doing', notes: '메모' });
    await moveIssue(owner, todo.id, 'todo', 0);
    await bulkUpdateTodos(owner, { action: 'complete', ids: [todo.id] });
    const doc = await me.call('create_document', { title: '설계', linkTodos: ['HI-1'] });

    const byKey = await me.call('get_history', { todo: 'hi-1' });
    expect(byKey.subject).toEqual({ todo: { id: todo.id, key: 'HI-1', title: '히스토리' } });
    expect(byKey.items.map((item: { what: string }) => item.what)).toEqual(['생성', '수정', '이동', '완료', '문서 생성']);
    expect(byKey.items[0]).toMatchObject({ who: 'Claude·Codex (mcp)' });
    expect(byKey.items[0].at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(byKey.items[1].changes).toEqual(['메모: 없음 → 메모', '상태: 할 일 → 진행 중']); // jsonb key order
    expect(byKey.items[2]).toMatchObject({ who: '웹', changes: ['상태: 진행 중 → 할 일'] });
    expect(byKey.items[3]).toMatchObject({ who: '웹 · 일괄', changes: ['상태: 할 일 → 완료'] });
    expect(await me.call('get_history', { todo: todo.id })).toEqual(byKey);
    expect((await me.call('get_history', { todo: 'HI-1', via: 'mcp' })).items).toHaveLength(3);
    expect((await me.call('get_history', { todo: 'HI-1', via: 'bulk' })).items.map((item: { what: string }) => item.what)).toEqual(['완료']);
    expect((await me.call('get_history', { todo: 'HI-1', via: 'ui' })).items.map((item: { what: string }) => item.what)).toEqual(['이동', '완료']);
    expect((await me.call('get_history', { todo: 'HI-1', limit: 2 })).items.map((item: { what: string }) => item.what)).toEqual(['완료', '문서 생성']);
    expect((await me.call('get_history', { todo: 'HI-1', until: '2020-01-01' })).items).toEqual([]);
    expect((await me.call('get_history', { document: doc.id })).items.map((item: { what: string }) => item.what)).toEqual(['문서 생성']);

    const recent = await me.call('get_history', {});
    expect(recent.since).not.toBeNull();
    expect(recent.items).toHaveLength(5);
    expect(recent.items[0].subject).toBe('HI-1 히스토리');
    expect(recent.items[4].subject).toBe('문서: 설계');

    expect(await them.call('get_history', { todo: todo.id })).toEqual({ error: 'Not found' });
    expect(await them.call('get_history', { todo: 'HI-1' })).toEqual({ error: 'Not found' });
    expect(await them.call('get_history', { document: doc.id })).toEqual({ error: 'Not found' });
    expect((await them.call('get_history', {})).items).toEqual([]);
    expect((await me.call('get_history', { todo: 'HI-1', document: doc.id })).error).toMatch(/not both/);

    const resource = await me.read(`todo://history/${todo.id}`);
    expect(resource).toContain('# 변경 이력: HI-1 히스토리');
    expect(resource).toContain('수정 · Claude·Codex (mcp) · 메모: 없음 → 메모; 상태: 할 일 → 진행 중');
    expect(await me.read('todo://history/HI-1')).toBe(resource.replace(`todo://history/${todo.id}`, 'todo://history/HI-1'));
    const issue = await me.read(`todo://issue/${todo.id}`);
    expect(issue).toContain('## 최근 변경 이력');
    expect(issue.split('\n').filter((line) => /^- \d{4}-/.test(line))).toHaveLength(5);
    await expect(them.read(`todo://history/${todo.id}`)).rejects.toThrow();
  } finally {
    await me.close();
    await them.close();
  }
});

it('get_todo and list_todos carry the board GitHub summary; history names the PR event', async () => {
  const owner = crypto.randomUUID();
  const repo = `me/yg44-${crypto.randomUUID().slice(0, 8)}`;
  await connectRepo(owner, repo, 'GH');
  const { call, close } = await connect(owner);
  try {
    const todo = await call('create_todo', { area: '개발', title: 'PR 붙는 일', prefix: 'GH' });
    const plain = await call('create_todo', { area: '개발', title: 'PR 없는 일' });
    const pr = { number: 7, html_url: `https://github.com/${repo}/pull/7`, state: 'open', title: 'GH-1: 작업', head: { ref: 'feat/gh-1-x', sha: 'abc1234' } };
    await handleGitHubEvent('pull_request', crypto.randomUUID(), { action: 'opened', repository: { full_name: repo }, pull_request: pr });
    await handleGitHubEvent('check_suite', crypto.randomUUID(), { action: 'completed', repository: { full_name: repo }, check_suite: { conclusion: 'success', head_sha: 'abc1234', head_branch: 'feat/gh-1-x', pull_requests: [{ number: 7 }] } });

    const read = await call('get_todo', { key: 'GH-1' });
    expect(read.github).toEqual({ pr: { number: 7, url: pr.html_url, state: 'open', ci: 'success' }, deploy: null });
    expect((await call('get_todo', { id: plain.id })).github).toBeNull();
    const listed = (await call('list_todos', {})).todos;
    expect(listed.find((item: { id: string }) => item.id === todo.id).github.pr.number).toBe(7);
    expect(listed.find((item: { id: string }) => item.id === plain.id)).not.toHaveProperty('github');

    const items = (await call('get_history', { todo: 'GH-1', via: 'github' })).items;
    // PR evidence and the status change share one webhook transaction (same created_at), so only the set is fixed.
    expect(items.map((item: { what: string }) => item.what).sort()).toEqual(['CI success', 'PR 열림', '수정']);
    expect(items.find((item: { what: string }) => item.what === '수정')).toMatchObject({ who: 'GitHub', changes: ['상태: 할 일 → 진행 중'] });
    expect(items[2].what).toBe('CI success');
  } finally {
    await close();
  }
});
