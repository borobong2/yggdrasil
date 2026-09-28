import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { installTestOwner } from '../src/server/auth.js';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { issuePat, revokePat } from '../src/server/pats.js';
import { createDocument } from '../src/server/documents.js';
import { createGoal, createEpic, createIssue } from '../src/server/work.js';
import { createCapture } from '../src/server/captures.js';
import type { DeliveryPlanProvider } from '../src/server/openai.js';

const owner = '00000000-0000-4000-8000-000000008001';
const other = '00000000-0000-4000-8000-000000008002';
installTestOwner('yg08-owner-token', { id: owner });
installTestOwner('yg08-owner-two-token', { id: other });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const plan = { design: { title: 'MCP design', body: 'Read-only proposal' }, lanes: { fe: ['UI'], be: [], docs: [] } };
const provider: DeliveryPlanProvider = async () => ({ output: plan, model: { provider: 'fake', name: 'mcp-test' } });
afterAll(() => pool.end());

async function connect(token: string, useProvider = provider) {
  const app = createApp(undefined, useProvider);
  const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const client = new Client({ name: 'yg08-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  return { client, close };
}
function data(result: Awaited<ReturnType<Client['callTool']>>) {
  expect(result.isError).not.toBe(true);
  return JSON.parse((result.content as { text: string }[])[0]!.text);
}
async function snapshot() {
  const tables = ['captures', 'documents', 'goals', 'epics', 'issues', 'delivery_plan_acceptances', 'document_issue_links', 'activities'];
  return Promise.all(tables.map(async table => ({ table, rows: (await pool.query(`SELECT row_to_json(t) row FROM ${table} t ORDER BY row_to_json(t)::text`)).rows })));
}

it('rejects missing, invalid, revoked, session-fixture PATs even with dev override; rejects foreign Origin', async () => {
  const app = createApp();
  const pat = await issuePat(owner, 'revoked');
  await revokePat(owner, pat.id);
  const prior = process.env.YGGDRASIL_DEV_OWNER_ID;
  process.env.YGGDRASIL_DEV_OWNER_ID = owner;
  try {
    for (const token of ['', 'invalid', 'yg08-owner-token', pat.token]) {
      for (const method of ['GET', 'POST', 'DELETE']) {
        expect((await app.request('/mcp', { method, headers: token ? { authorization: `Bearer ${token}` } : {} })).status).toBe(401);
      }
    }
    const valid = await issuePat(owner, 'origin');
    expect((await app.request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${valid.token}`, origin: 'https://evil.example' } })).status).toBe(403);
    for (const origin of ['http://localhost', 'https://localhost']) {
      const response = await app.request('/mcp', { method: 'GET', headers: { authorization: `Bearer ${valid.token}`, origin } });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
    expect((await app.request('/mcp', { headers: { authorization: `Bearer ${valid.token}`, origin: 'null' } })).status).toBe(403);
  } finally { if (prior === undefined) delete process.env.YGGDRASIL_DEV_OWNER_ID; else process.env.YGGDRASIL_DEV_OWNER_ID = prior; }
});

it('runs the complete SDK client flow with exactly five tools, shared search and preserved source/work', async () => {
  const q = `MCP-${crypto.randomUUID()}`;
  const doc = await createDocument(owner, q, 'Body', null);
  const goal = await createGoal(owner, q);
  const epic = await createEpic(owner, goal.id, q);
  const issue = await createIssue(owner, epic.id, q, 'medium', null);
  const foreign = await createDocument(other, q, 'private', null);
  const foreignCapture = await createCapture(other, q);
  const foreignGoal = await createGoal(other, q);
  const foreignEpic = await createEpic(other, foreignGoal.id, q);
  const foreignIssue = await createIssue(other, foreignEpic.id, q, 'medium', null);
  const pat = await issuePat(owner, 'client');
  await pool.query("UPDATE personal_access_tokens SET created_at = now() - interval '48 hours' WHERE id = $1", [pat.id]);
  const { client, close } = await connect(pat.token);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name).sort()).toEqual(['create_capture', 'read_document', 'read_planning_tree', 'request_delivery_plan', 'search_workspace']);
    const search = data(await client.callTool({ name: 'search_workspace', arguments: { q } }));
    const rest = await createApp().request(`/api/search?q=${q}`, { headers: { authorization: 'Bearer yg08-owner-token' } });
    expect(search).toEqual(await rest.json());
    expect(search).toHaveLength(4);
    expect(data(await client.callTool({ name: 'read_document', arguments: { id: doc.id } }))).toMatchObject({ id: doc.id, body: 'Body' });
    expect((await client.callTool({ name: 'read_document', arguments: { id: foreign.id } })).isError).toBe(true);
    const tree = data(await client.callTool({ name: 'read_planning_tree' }));
    expect(tree.find((item: { id: string }) => item.id === goal.id).epics[0].issues[0].id).toBe(issue.id);
    for (const id of [foreignGoal.id, foreignEpic.id, foreignIssue.id]) expect(JSON.stringify(tree)).not.toContain(id);
    const capture = data(await client.callTool({ name: 'create_capture', arguments: { text: `  ${q}  ` } }));
    expect(capture).toMatchObject({ text: q, status: 'inbox' });
    const before = await snapshot();
    const proposal = data(await client.callTool({ name: 'request_delivery_plan', arguments: { captureId: capture.id } }));
    expect(proposal).toMatchObject({ captureId: capture.id, status: 'pending', ...plan });
    expect(await snapshot()).toEqual(before);
    expect((await client.callTool({ name: 'request_delivery_plan', arguments: { captureId: foreignCapture.id } })).isError).toBe(true);
    for (const name of ['accept_delivery_plan', 'update_issue', 'delete_capture']) expect((await client.callTool({ name, arguments: {} })).isError).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect((await pool.query('SELECT last_used_at, token_hash FROM personal_access_tokens WHERE id = $1', [pat.id])).rows[0]).toMatchObject({ last_used_at: expect.any(Date), token_hash: expect.not.stringContaining(pat.token) });
    await revokePat(owner, pat.id);
    await expect(client.listTools()).rejects.toMatchObject({ code: 401 });
  } finally { await close(); }
});

it('isolates simultaneous clients and rejects invalid inputs without writes', async () => {
  const q = `isolation-${crypto.randomUUID()}`;
  const one = await createDocument(owner, q, 'owner one', null);
  const two = await createDocument(other, q, 'owner two', null);
  const a = await connect((await issuePat(owner, 'one')).token);
  const b = await connect((await issuePat(other, 'two')).token);
  try {
    const [left, right] = await Promise.all([a.client, b.client].map(client => client.callTool({ name: 'search_workspace', arguments: { q } })));
    expect(data(left).map((row: { id: string }) => row.id)).toEqual([one.id]);
    expect(data(right).map((row: { id: string }) => row.id)).toEqual([two.id]);
    const before = await snapshot();
    for (const [name, args] of [
      ['create_capture', { text: ' ' }], ['create_capture', { text: 'x', ownerId: other }],
      ['read_document', { id: 'bad' }], ['request_delivery_plan', { captureId: 'bad' }],
      ['search_workspace', { q: 'x'.repeat(201) }], ['read_planning_tree', { ownerId: other }]
    ] as const) expect((await a.client.callTool({ name, arguments: args })).isError).toBe(true);
    expect(await snapshot()).toEqual(before);
  } finally { await a.close(); await b.close(); }
});

it.each(['failure', 'invalid'] as const)('fails closed on provider %s without persisting proposal or changing source/work', async mode => {
  const capture = await createCapture(owner, 'Provider failure');
  const bad: DeliveryPlanProvider = async () => { if (mode === 'failure') throw new Error('secret upstream'); return { output: { ...plan, accept: true }, model: { provider: 'fake', name: 'bad' } }; };
  const { client, close } = await connect((await issuePat(owner, mode)).token, bad);
  try {
    const before = await snapshot();
    const result = await client.callTool({ name: 'request_delivery_plan', arguments: { captureId: capture.id } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret upstream');
    expect(await snapshot()).toEqual(before);
    expect((await pool.query('SELECT id FROM delivery_plan_proposals WHERE capture_id = $1', [capture.id])).rows).toEqual([]);
  } finally { await close(); }
});
