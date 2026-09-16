import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token' };
const plan = { design: { title: 'Garden delivery plan', body: 'Build it in small, reviewable steps.' }, lanes: { fe: ['Capture preview'], be: ['Validate provider output'], docs: ['Document the boundary'] } };

afterAll(() => pool.end());

async function capture(app = createApp()) {
  return (await app.request('/api/captures', { method: 'POST', headers, body: JSON.stringify({ text: 'Plan a garden' }) })).json();
}

async function unchangedTables() {
  const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'delivery_plan_proposals' ORDER BY tablename");
  return Promise.all(rows.map(async ({ tablename }) => ({ table: tablename, rows: (await pool.query(`SELECT row_to_json(t) AS row FROM \"${tablename.replaceAll('\"', '\"\"')}\" t ORDER BY row_to_json(t)::text`)).rows })));
}

it('stores exactly one pending delivery plan and changes no capture, document, or work row', async () => {
  const app = createApp(undefined, async () => ({ output: plan, model: { provider: 'fake', name: 'delivery-v1' } }));
  const source = await capture(app);
  const before = await unchangedTables();
  const response = await app.request(`/api/captures/${source.id}/delivery-plan`, { method: 'POST', headers });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ captureId: source.id, status: 'pending', ...plan, model: { provider: 'fake', name: 'delivery-v1' } });
  expect((await pool.query('SELECT count(*)::int AS count FROM delivery_plan_proposals WHERE capture_id = $1', [source.id])).rows).toEqual([{ count: 1 }]);
  expect(await unchangedTables()).toEqual(before);
});

it('lists only the owner capture proposals after a fresh app load', async () => {
  const app = createApp(undefined, async () => ({ output: plan, model: { provider: 'fake', name: 'delivery-v1' } }));
  const source = await capture(app);
  const path = `/api/captures/${source.id}/delivery-plan`;
  expect(await (await app.request(path, { headers })).json()).toEqual([]);
  const created = await (await app.request(path, { method: 'POST', headers })).json();
  expect(await (await createApp(undefined, async () => ({ output: plan, model: { provider: 'fake', name: 'delivery-v1' } })).request(path, { headers })).json()).toEqual([created]);
  expect((await app.request(path, { headers: other })).status).toBe(404);
});

it.each([
  { design: { title: '', body: 'body' }, lanes: { fe: [], be: [], docs: [] } },
  { design: { title: 'title', body: 'body' }, lanes: { fe: ['x'.repeat(201)], be: [], docs: [] } },
  { design: { title: 'title', body: 'body' }, lanes: { fe: Array(11).fill('x'), be: [], docs: [] } },
  { design: { title: 'title', body: 'body' }, lanes: { fe: [], be: [], docs: [] }, extra: true },
  null
])('fails closed for malformed provider output: %j', async (output) => {
  const app = createApp(undefined, async () => ({ output, model: { provider: 'fake', name: 'invalid' } }));
  const source = await capture(app);
  const before = await unchangedTables();
  expect((await app.request(`/api/captures/${source.id}/delivery-plan`, { method: 'POST', headers })).status).toBe(502);
  expect(await unchangedTables()).toEqual(before);
});

it('contains provider failures without persisting a plan', async () => {
  const app = createApp(undefined, async () => { throw new Error('secret upstream detail'); });
  const source = await capture(app);
  const response = await app.request(`/api/captures/${source.id}/delivery-plan`, { method: 'POST', headers });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'Delivery plan generation failed. Please try again.' });
});
