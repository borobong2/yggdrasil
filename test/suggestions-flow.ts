import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { fakeSuggestionProvider } from './fake-suggestion-provider.js';

assert(process.env.DATABASE_URL, 'Use local Docker DATABASE_URL');
process.env.NODE_ENV = 'test';
process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const app = createApp(fakeSuggestionProvider);
app.use('*', serveStatic({ root: './dist/client' }));
const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  const html = await page.text();
  const script = html.match(/src="([^"]+\.js)"/);
  assert(script);
  const bundle = await (await fetch(base + script[1])).text();
  assert(bundle.includes('Pending — unaccepted. No items have been changed.'));
  assert(!bundle.includes('api.openai.com') && !bundle.includes('process.env.OPENAI_API_KEY'));
  const created = await fetch(`${base}/api/captures`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'HTTP flow: Plan a garden' }) });
  assert.equal(created.status, 201);
  const capture = await created.json();
  const path = `${base}/api/captures/${capture.id}/suggestions`;
  const before = (await pool.query('SELECT * FROM captures WHERE id = $1', [capture.id])).rows;
  const generated = await fetch(path, { method: 'POST' });
  assert.equal(generated.status, 201);
  const suggestion = await generated.json();
  assert.equal(suggestion.status, 'pending');
  assert.deepEqual(suggestion.model, { provider: 'fake', name: 'deterministic-v1' });
  const reloaded = await fetch(path);
  assert.deepEqual(await reloaded.json(), [suggestion]);
  assert.deepEqual((await pool.query('SELECT * FROM captures WHERE id = $1', [capture.id])).rows, before);
  assert.deepEqual((await pool.query('SELECT status FROM suggestions WHERE capture_id = $1', [capture.id])).rows, [{ status: 'pending' }]);
  const captures = await (await fetch(`${base}/api/captures`)).json();
  assert(captures.some((item: { id: string }) => item.id === capture.id));
  console.log(JSON.stringify({ result: 'passed', captureId: capture.id, suggestionId: suggestion.id, status: suggestion.status, checks: ['built Inbox HTML and pending label', 'no server provider code in browser bundle', 'HTTP capture 201', 'HTTP generate 201', 'HTTP reload identical pending suggestion', 'SQL exactly one pending suggestion', 'capture unchanged'] }, null, 2));
} finally {
  await pool.end();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
// Application pools are process-scoped in this MVP, as in the server entrypoint.
process.exit(0);
