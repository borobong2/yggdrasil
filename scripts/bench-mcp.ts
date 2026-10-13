// Usage (from products/yggdrasil, LOCAL database only):
//   DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/<db> npx tsx scripts/bench-mcp.ts [--rtt 30] [--n 10]
// Times create_todo over the real MCP HTTP route: n sequential, n parallel, and (when the tool exists) one create_todos batch.
// Every pg query is counted; --rtt adds that many ms before each query to mimic Cloud Run → Supabase pooler round trips.
import { parseArgs } from 'node:util';
import pg from 'pg';

const { values } = parseArgs({ options: { rtt: { type: 'string', default: '0' }, n: { type: 'string', default: '10' } } });
const [rtt, n] = [Number(values.rtt), Number(values.n)];
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? '')) throw new Error('bench-mcp writes rows: point DATABASE_URL at a local database');

let queries = 0;
const query = pg.Client.prototype.query as (...args: unknown[]) => unknown;
pg.Client.prototype.query = function (this: pg.Client, ...args: unknown[]) {
  queries++;
  return rtt ? new Promise((resolve) => setTimeout(resolve, rtt)).then(() => query.apply(this, args)) : query.apply(this, args);
} as typeof pg.Client.prototype.query;

const { serve } = await import('@hono/node-server');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { createApp } = await import('../src/server/app.js');
const { issuePat } = await import('../src/server/pats.js');
const { getDb } = await import('../src/server/db.js');

const owner = crypto.randomUUID();
const { token } = await issuePat(owner, 'bench');
const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
if (!server.listening) await new Promise<void>((resolve) => server.once('listening', resolve));
const client = new Client({ name: 'bench-mcp', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } }));

const item = (label: string, i: number) => ({ area: 'bench', title: `${label} ${i}`, prefix: 'BN', dueAt: '2026-10-20' });
async function timed(label: string, count: number, run: () => Promise<unknown>) {
  const [start, before] = [performance.now(), queries];
  await run();
  const ms = performance.now() - start;
  console.log(`${label.padEnd(28)} ${ms.toFixed(0).padStart(6)} ms total  ${(ms / count).toFixed(1).padStart(6)} ms/item  ${((queries - before) / count).toFixed(1).padStart(5)} queries/item`);
}
const call = async (name: string, args: Record<string, unknown>) => { const result = await client.callTool({ name, arguments: args }); if (result.isError) throw new Error(JSON.stringify(result.content)); };

console.log(`rtt=${rtt}ms n=${n}`);
await call('create_todo', item('warmup', 0));
await timed(`${n} sequential create_todo`, n, async () => { for (let i = 0; i < n; i++) await call('create_todo', item('seq', i)); });
await timed(`${n} parallel create_todo`, n, () => Promise.all(Array.from({ length: n }, (_, i) => call('create_todo', item('par', i)))));
if ((await client.listTools()).tools.some((tool) => tool.name === 'create_todos'))
  await timed(`1 create_todos (${n} items)`, n, () => call('create_todos', { items: Array.from({ length: n }, (_, i) => item('batch', i)) }));
const { id } = JSON.parse(((await client.callTool({ name: 'create_todo', arguments: item('upd', 0) })).content as { text: string }[])[0]!.text);
await timed(`${n} sequential update_todo`, n, async () => { for (let i = 0; i < n; i++) await call('update_todo', { id, notes: String(i) }); });

await client.close();
server.close();
await getDb().$client.end();
