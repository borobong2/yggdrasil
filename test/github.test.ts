import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { findKeys } from '../src/server/github.js';
import { issuePat } from '../src/server/pats.js';
import { createTodo, updateTodo } from '../src/server/todos.js';
import { getDb } from '../src/server/db.js';
import { allocateKey } from '../src/server/ticket-keys.js';
import { searchWorkspace } from '../src/server/search.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = createApp();
const secret = 'test-webhook-secret';
const run = crypto.randomUUID().slice(0, 8);
afterAll(() => pool.end());
beforeEach(() => { process.env.GITHUB_WEBHOOK_SECRET = secret; });
afterEach(() => { delete process.env.GITHUB_WEBHOOK_SECRET; });

function owner() {
  const id = crypto.randomUUID();
  installTestOwner(`gh-${id}`, { id });
  return { id, headers: { authorization: `Bearer gh-${id}`, 'content-type': 'application/json' } };
}
async function connect(headers: Record<string, string>, fullName: string, prefix = 'YG', start?: number) {
  return app.request('/api/github/repos', { method: 'POST', headers, body: JSON.stringify({ fullName, prefix, ...(start ? { start } : {}) }) });
}
function hook(event: string, payload: unknown, delivery: string = crypto.randomUUID(), sign = secret) {
  const body = JSON.stringify(payload);
  return app.request('/api/webhooks/github', { method: 'POST', body, headers: {
    'content-type': 'application/json', 'x-github-event': event, 'x-github-delivery': delivery,
    'x-hub-signature-256': `sha256=${createHmac('sha256', sign).update(body).digest('hex')}`
  } });
}
async function evidence(issueId: string) {
  return (await pool.query('SELECT kind, url, state, ci, pr_number, metadata FROM issue_evidence WHERE issue_id = $1 ORDER BY created_at, id', [issueId])).rows;
}
async function issueRow(id: string) { return (await pool.query('SELECT status, notes, key FROM issues WHERE id = $1', [id])).rows[0]; }
async function setup(start = 24) {
  const me = owner();
  const repo = `borobong2/yg24-${run}-${crypto.randomUUID().slice(0, 6)}`;
  expect((await connect(me.headers, repo, 'yg', start)).status).toBe(201);
  const todo = await createTodo(me.id, { area: '개발', title: 'GitHub 연동', prefix: 'YG' });
  return { me, repo, todo };
}
const pr = (repo: string, extra: Record<string, unknown> = {}) => ({
  number: 7, html_url: `https://github.com/${repo}/pull/7`, title: 'YG-24: GitHub 연동', body: 'tracks yg-24', state: 'open', merged: false,
  head: { ref: 'feat/yg-24-github-tracking', sha: 'a'.repeat(40) }, merge_commit_sha: null, ...extra
});

it('allocates sequential per-owner keys from a configurable start, without duplicates under concurrency', async () => {
  const { me, todo } = await setup(24);
  expect(todo.key).toBe('YG-24');
  expect((await createTodo(me.id, { area: '개발', title: 'next', prefix: 'yg' })).key).toBe('YG-25');
  const many = await Promise.all(Array.from({ length: 12 }, (_, i) => createTodo(me.id, { area: '개발', title: `parallel ${i}`, prefix: 'YG' })));
  expect(new Set(many.map((item) => item.key)).size).toBe(12);
  expect(many.map((item) => Number(item.key!.split('-')[1])).sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => 26 + i));
  // Another owner and an unconfigured prefix start at 1; reconnecting never moves a counter backwards.
  const other = owner();
  expect((await createTodo(other.id, { area: '개발', title: 'x', prefix: 'YG' })).key).toBe('YG-1');
  expect((await createTodo(me.id, { area: '개발', title: 'x', prefix: 'ABC' })).key).toBe('ABC-1');
  // No prefix → no key; update with prefix assigns one only when missing.
  const plain = await createTodo(me.id, { area: '개발', title: 'plain' });
  expect(plain.key).toBeNull();
  const keyed = await updateTodo(me.id, plain.id, { prefix: 'YG' });
  expect(keyed.key).toBe('YG-38');
  expect((await updateTodo(me.id, plain.id, { prefix: 'YG' })).key).toBe('YG-38');
  // UI route accepts a prefix too.
  const epicId = keyed.epicId;
  const created = await (await app.request('/api/issues', { method: 'POST', headers: me.headers, body: JSON.stringify({ title: 'from ui', epicId, prefix: 'YG' }) })).json();
  expect(created.key).toBe('YG-39');
  expect((await app.request('/api/issues', { method: 'POST', headers: me.headers, body: JSON.stringify({ title: 'bad', epicId, prefix: 'Y-G' }) })).status).toBe(400);
  // Keys show in search.
  expect(await searchWorkspace(me.id, 'yg-24')).toEqual([expect.objectContaining({ kind: 'issue', id: todo.id, title: 'YG-24: GitHub 연동' })]);
});

it('allocates distinct keys from independent concurrent statements', async () => {
  const id = crypto.randomUUID();
  const keys = await Promise.all(Array.from({ length: 20 }, () => allocateKey(getDb(), id, 'zz')));
  expect(keys.map((key) => Number(key.split('-')[1])).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
});

it('create_todo over MCP accepts a prefix and resources show the key', async () => {
  const me = owner();
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
  const client = new Client({ name: 'yg24-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${(await issuePat(me.id, 'yg24')).token}` } } }));
    const result = await client.callTool({ name: 'create_todo', arguments: { area: '개발', title: '키 테스트', prefix: 'YG', priority: 'p1' } });
    const created = JSON.parse((result.content as { text: string }[])[0]!.text);
    expect(created.key).toBe('YG-1');
    const today = await client.readResource({ uri: 'todo://today' });
    expect((today.contents[0] as { text: string }).text).toContain('YG-1: 키 테스트');
    const detail = await client.readResource({ uri: `todo://issue/${created.id}` });
    expect((detail.contents[0] as { text: string }).text).toContain('- 키: YG-1');
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

it('matches keys case-insensitively on word boundaries', () => {
  expect(findKeys('YG', ['feat/yg-24-github', 'YG-24: x', 'see Yg-7 and YG-240', 'xyg-5', 'YG-0', 'YG-024'])).toEqual(['YG-24', 'YG-7', 'YG-240']);
});

it('verifies the webhook signature and returns 503 without a secret', async () => {
  const { repo } = await setup();
  delete process.env.GITHUB_WEBHOOK_SECRET;
  expect((await hook('ping', { repository: { full_name: repo } })).status).toBe(503);
  process.env.GITHUB_WEBHOOK_SECRET = secret;
  expect((await hook('ping', { repository: { full_name: repo } }, undefined, 'wrong')).status).toBe(401);
  const unsigned = await app.request('/api/webhooks/github', { method: 'POST', body: '{}', headers: { 'x-github-event': 'ping', 'x-github-delivery': crypto.randomUUID() } });
  expect(unsigned.status).toBe(401);
  const ok = await hook('ping', { repository: { full_name: repo } });
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ result: 'processed', repos: 1 });
});

it('ignores unknown repos and duplicate deliveries', async () => {
  const { repo, todo } = await setup();
  const unknown = await hook('push', { ref: 'refs/heads/feat/yg-24-x', after: 'b'.repeat(40), repository: { full_name: 'someone/elsewhere' } });
  expect(await unknown.json()).toEqual({ result: 'ignored', repos: 0 });
  const delivery = crypto.randomUUID();
  const payload = { ref: 'refs/heads/feat/yg-24-x', after: 'b'.repeat(40), repository: { full_name: repo.toUpperCase() } };
  expect(await (await hook('push', payload, delivery)).json()).toEqual({ result: 'processed', repos: 1 });
  expect(await (await hook('push', payload, delivery)).json()).toEqual({ result: 'duplicate', repos: 0 });
  expect(await evidence(todo.id)).toHaveLength(1);
  expect((await pool.query("SELECT count(*)::int AS n FROM activities WHERE subject_id = $1 AND payload->>'via' = 'github'", [todo.id])).rows[0].n).toBe(2);
});

it('push to a keyed branch moves the issue to doing with branch evidence and github activity', async () => {
  const { me, repo, todo } = await setup();
  const delivery = crypto.randomUUID();
  await hook('push', { ref: 'refs/heads/feat/yg-24-github-tracking', after: 'b'.repeat(40), repository: { full_name: repo } }, delivery);
  expect((await issueRow(todo.id)).status).toBe('doing');
  expect(await evidence(todo.id)).toEqual([expect.objectContaining({ kind: 'github_branch', url: `https://github.com/${repo}/tree/feat/yg-24-github-tracking` })]);
  const activity = (await pool.query("SELECT kind, payload FROM activities WHERE owner_id = $1 AND subject_id = $2 AND payload->>'via' = 'github' ORDER BY created_at", [me.id, todo.id])).rows;
  expect(activity.map((row) => row.kind).sort()).toEqual(['evidence.added', 'issue.updated']);
  expect(activity.every((row) => row.payload.delivery === delivery)).toBe(true);
  const repos = await (await app.request('/api/github/repos', { headers: me.headers })).json();
  expect(repos[0]).toMatchObject({ fullName: repo, prefix: 'YG', lastStatus: 'push → 1 issue(s)' });
  expect(repos[0].lastEventAt).toBeTruthy();
});

it('PR open → doing, CI result stored, merge → done with commit evidence, deploy → badge', async () => {
  const { me, repo, todo } = await setup();
  await hook('pull_request', { action: 'opened', pull_request: pr(repo), repository: { full_name: repo } });
  expect((await issueRow(todo.id)).status).toBe('doing');
  await hook('check_suite', { action: 'completed', check_suite: { conclusion: 'failure', head_branch: 'feat/yg-24-github-tracking', head_sha: 'a'.repeat(40), pull_requests: [{ number: 7 }] }, repository: { full_name: repo } });
  expect((await evidence(todo.id))[0]).toMatchObject({ kind: 'github_pr', state: 'open', ci: 'failure', pr_number: 7 });
  await hook('workflow_run', { action: 'completed', workflow_run: { conclusion: 'success', head_branch: 'feat/yg-24-github-tracking', head_sha: 'a'.repeat(40), pull_requests: [] }, repository: { full_name: repo } });
  expect((await evidence(todo.id))[0].ci).toBe('success');
  await hook('pull_request', { action: 'closed', pull_request: pr(repo, { state: 'closed', merged: true, merge_commit_sha: 'c'.repeat(40) }), repository: { full_name: repo } });
  expect((await issueRow(todo.id)).status).toBe('done');
  expect(await evidence(todo.id)).toEqual([
    expect.objectContaining({ kind: 'github_pr', state: 'merged', ci: 'success' }),
    expect.objectContaining({ kind: 'github_commit', url: `https://github.com/${repo}/commit/${'c'.repeat(40)}` })
  ]);
  // Deployment of the merge commit (ref = main) finds the issue by sha.
  await hook('deployment_status', { action: 'created', deployment: { sha: 'c'.repeat(40), ref: 'main', environment: 'production' }, deployment_status: { state: 'success', environment_url: 'https://yggdrasil.example.app' }, repository: { full_name: repo } });
  const issues = await (await app.request('/api/issues', { headers: me.headers })).json();
  expect(issues.find((item: { id: string }) => item.id === todo.id)).toMatchObject({ key: 'YG-24', github: {
    pr: { number: 7, url: `https://github.com/${repo}/pull/7`, state: 'merged', ci: 'success' }, deploy: { url: 'https://yggdrasil.example.app', state: 'success' }
  } });
  const completed = (await pool.query("SELECT payload FROM activities WHERE subject_id = $1 AND kind = 'issue.completed'", [todo.id])).rows;
  expect(completed).toEqual([{ payload: expect.objectContaining({ via: 'github', event: 'pull_request', to: 'done' }) }]);
});

it('PR closed without merge returns the issue to todo with a note; done issues stay done', async () => {
  const { me, repo, todo } = await setup();
  await updateTodo(me.id, todo.id, { notes: '기존 메모' });
  await hook('pull_request', { action: 'opened', pull_request: pr(repo), repository: { full_name: repo } });
  await hook('pull_request', { action: 'closed', pull_request: pr(repo, { state: 'closed' }), repository: { full_name: repo } });
  const row = await issueRow(todo.id);
  expect(row.status).toBe('todo');
  expect(row.notes).toMatch(/^기존 메모\n\[GitHub\] PR #7 병합 없이 닫힘/);
  expect((await evidence(todo.id))[0].state).toBe('closed');
  await updateTodo(me.id, todo.id, { status: 'done' });
  await hook('pull_request', { action: 'reopened', pull_request: pr(repo), repository: { full_name: repo } });
  expect((await issueRow(todo.id)).status).toBe('done');
});

it('only touches issues of owners who connected the repo', async () => {
  const { repo, todo } = await setup();
  const stranger = owner();
  const theirs = await createTodo(stranger.id, { area: '개발', title: 'same key elsewhere', prefix: 'YG' });
  await pool.query("UPDATE issues SET key = 'YG-24' WHERE id = $1", [theirs.id]);
  await hook('pull_request', { action: 'opened', pull_request: pr(repo), repository: { full_name: repo } });
  expect((await issueRow(todo.id)).status).toBe('doing');
  expect((await issueRow(theirs.id)).status).toBe('todo');
  expect(await evidence(theirs.id)).toEqual([]);
});

it('manages repos per owner, accepts a PAT, and refuses company repos', async () => {
  const me = owner();
  const other = owner();
  const repo = `borobong2/yg24-${run}-repos`;
  const pat = (await issuePat(me.id, 'connect-repo')).token;
  const created = await connect({ authorization: `Bearer ${pat}`, 'content-type': 'application/json' }, repo, 'YG', 24);
  expect(created.status).toBe(201);
  const body = await created.json();
  expect(body).toMatchObject({ fullName: repo, prefix: 'YG', lastEventAt: null });
  expect((await connect(me.headers, repo, 'YGG')).status).toBe(201);
  expect(await (await app.request('/api/github/repos', { headers: me.headers })).json()).toEqual([expect.objectContaining({ id: body.id, prefix: 'YGG' })]);
  expect(await (await app.request('/api/github/repos', { headers: other.headers })).json()).toEqual([]);
  expect((await connect(me.headers, 'Creatived-Digital-Lab/app', 'CD')).status).toBe(403);
  expect((await connect(me.headers, 'not a repo', 'YG')).status).toBe(400);
  expect((await connect(me.headers, repo, '9X')).status).toBe(400);
  expect((await app.request('/api/github/repos', { headers: { authorization: 'Bearer ygpat_invalid' } })).status).toBe(401);
  expect((await app.request(`/api/github/repos/${body.id}`, { method: 'DELETE', headers: other.headers })).status).toBe(404);
  expect((await app.request(`/api/github/repos/${body.id}`, { method: 'DELETE', headers: me.headers })).status).toBe(204);
  expect(await (await app.request('/api/github/repos', { headers: me.headers })).json()).toEqual([]);
});
