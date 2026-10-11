import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/server/app.js';
import { issuePat, revokePat } from '../src/server/pats.js';
import { createTodo } from '../src/server/todos.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

async function connect(token: string) {
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const client = new Client({ name: 'yg14-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  return { client, close };
}
function data(result: Awaited<ReturnType<Client['callTool']>>) {
  expect(result.isError).not.toBe(true);
  return JSON.parse((result.content as { text: string }[])[0]!.text);
}
async function ownerRows(owner: string) {
  return Promise.all(['goals', 'epics', 'issues', 'activities'].map(async (table) => (await pool.query(`SELECT row_to_json(t) AS row FROM ${table} t WHERE owner_id = $1 ORDER BY row_to_json(t)::text`, [owner])).rows));
}

it('creates, updates and completes todos over MCP with via=mcp activity and no delete tool', async () => {
  const owner = crypto.randomUUID();
  const { client, close } = await connect((await issuePat(owner, 'todo')).token);
  try {
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['create_todo', 'update_todo', 'complete_todo']));
    expect(names.filter((name) => /delete|remove/.test(name))).toEqual([]);

    const created = data(await client.callTool({ name: 'create_todo', arguments: { area: '잡일', title: '가계부 정리', dueAt: '2026-10-12', priority: 'p1' } }));
    expect(created).toMatchObject({ area: '잡일', epic: '일반', title: '가계부 정리', status: 'todo', priority: 'p1', dueAt: '2026-10-11T15:00:00.000Z' });
    const updated = data(await client.callTool({ name: 'update_todo', arguments: { id: created.id, hold: 'waiting', holdReason: '영수증', notes: '카드값 포함', estimateMinutes: 20 } }));
    expect(updated).toMatchObject({ hold: 'waiting', holdReason: '영수증', notes: '카드값 포함', estimateMinutes: 20 });
    expect(data(await client.callTool({ name: 'complete_todo', arguments: { id: created.id } }))).toMatchObject({ status: 'done' });

    const { rows } = await pool.query('SELECT kind, actor_id, payload FROM activities WHERE subject_id = $1 ORDER BY created_at, id', [created.id]);
    expect(rows.map((row) => [row.kind, row.payload.via, row.actor_id])).toEqual([['issue.created', 'mcp', owner], ['issue.updated', 'mcp', owner], ['issue.completed', 'mcp', owner]]);
    expect((await pool.query("SELECT title FROM goals WHERE owner_id = $1", [owner])).rows).toEqual([{ title: '잡일' }]);
  } finally { await close(); }
});

it('rejects revoked PATs with 401 before any write', async () => {
  const owner = crypto.randomUUID();
  const pat = await issuePat(owner, 'revoked');
  const { client, close } = await connect(pat.token);
  try {
    await revokePat(owner, pat.id);
    await expect(client.callTool({ name: 'create_todo', arguments: { area: '개인', title: 'x' } })).rejects.toMatchObject({ code: 401 });
    const response = await createApp().request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${pat.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_todo', arguments: { area: '개인', title: 'x' } } }) });
    expect(response.status).toBe(401);
    expect(await ownerRows(owner)).toEqual([[], [], [], []]);
  } finally { await close(); }
});

it('isolates owners and rejects invalid input without writes', async () => {
  const owner = crypto.randomUUID();
  const intruder = crypto.randomUUID();
  const todo = await createTodo(owner, { area: '커리어', title: '이력서' });
  const { client, close } = await connect((await issuePat(intruder, 'intruder')).token);
  try {
    const before = await ownerRows(owner);
    for (const [name, args] of [
      ['update_todo', { id: todo.id, title: 'stolen' }], ['complete_todo', { id: todo.id }],
      ['create_todo', { area: '커리어', title: 'x', ownerId: owner }]
    ] as const) expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
    expect(await ownerRows(owner)).toEqual(before);

    const mine = await ownerRows(intruder);
    for (const [name, args] of [
      ['create_todo', { title: 'no area' }], ['create_todo', { area: ' ', title: 'x' }], ['create_todo', { area: 'a', title: '' }],
      ['create_todo', { area: 'a', title: 'x', priority: 'high' }], ['create_todo', { area: 'a', title: 'x', hold: 'later' }],
      ['create_todo', { area: 'a', title: 'x', dueAt: 'tomorrow' }], ['create_todo', { area: 'a', title: 'x', estimateMinutes: -5 }],
      ['create_todo', { area: 'a', title: 'x', source: 'forged' }], ['update_todo', { id: 'bad', title: 'x' }],
      ['update_todo', { id: todo.id }], ['complete_todo', { id: 'bad' }], ['delete_todo', { id: todo.id }]
    ] as const) expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
    expect(await ownerRows(intruder)).toEqual(mine);
  } finally { await close(); }
});
