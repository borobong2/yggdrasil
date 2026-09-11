import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { fakeSuggestionProvider } from './fake-suggestion-provider.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token' };
const app = createApp(fakeSuggestionProvider);
afterAll(() => pool.end());
afterEach(() => vi.unstubAllEnvs());

async function capture() {
  return (await app.request('/api/captures', { method: 'POST', headers, body: JSON.stringify({ text: 'Plan a garden' }) })).json();
}

// Snapshot actual public tables, including future core-item tables if present.
async function unchangedTables() {
  const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'suggestions' ORDER BY tablename");
  return Promise.all(rows.map(async ({ tablename }) => ({ table: tablename, rows: (await pool.query(`SELECT row_to_json(t) AS row FROM "${tablename.replaceAll('"', '""')}" t ORDER BY row_to_json(t)::text`)).rows })));
}

it('stores exactly one pending proposal and changes no capture or core-item table', async () => {
  const source = await capture();
  const before = await unchangedTables();
  const response = await app.request(`/api/captures/${source.id}/suggestions`, { method: 'POST', headers });
  expect(response.status).toBe(201);
  const proposal = await response.json();
  expect(proposal).toMatchObject({ captureId: source.id, title: 'Plan a garden', type: 'project', status: 'pending', model: { provider: 'fake', name: 'deterministic-v1' } });
  expect(Object.keys(proposal).sort()).toEqual(['captureId', 'id', 'model', 'status', 'title', 'type']);
  expect((await pool.query('SELECT status FROM suggestions WHERE capture_id = $1', [source.id])).rows).toEqual([{ status: 'pending' }]);
  expect(await unchangedTables()).toEqual(before);
});

it('lists only this capture, newest first, including after a fresh app load', async () => {
  const source = await capture();
  const path = `/api/captures/${source.id}/suggestions`;
  expect(await (await app.request(path, { headers })).json()).toEqual([]);
  const first = await (await app.request(path, { method: 'POST', headers })).json();
  const second = await (await app.request(path, { method: 'POST', headers })).json();
  const reloaded = await createApp(fakeSuggestionProvider).request(path, { headers });
  expect(reloaded.status).toBe(200);
  expect(await reloaded.json()).toEqual([second, first]);
  const another = await capture();
  expect(await (await app.request(`/api/captures/${another.id}/suggestions`, { headers })).json()).toEqual([]);
});

it('hides foreign and missing captures and rejects unauthenticated requests', async () => {
  const source = await capture();
  const provider = vi.fn(fakeSuggestionProvider);
  const isolated = createApp(provider);
  for (const method of ['GET', 'POST']) {
    expect((await isolated.request(`/api/captures/${source.id}/suggestions`, { method, headers: other })).status).toBe(404);
    expect((await isolated.request(`/api/captures/${crypto.randomUUID()}/suggestions`, { method, headers })).status).toBe(404);
    expect((await isolated.request(`/api/captures/${source.id}/suggestions`, { method })).status).toBe(401);
    expect((await isolated.request('/api/captures/not-a-uuid/suggestions', { method, headers })).status).toBe(400);
  }
  expect(provider).not.toHaveBeenCalled();
});

it.each([
  { title: '', type: 'project', targetId: null },
  { title: 'Bad type', type: 'team', targetId: null },
  { title: 'Bad target', type: 'issue', targetId: 42 },
  { title: 'Invented target', type: 'issue', targetId: 'foreign-id' },
  { title: 'Extra mutation', type: 'document', targetId: null, body: 'write this' },
  null
])('rejects invalid provider output without persisting anything: %j', async (output) => {
  const source = await capture();
  const invalid = createApp(async () => ({ output, model: { provider: 'fake', name: 'invalid' } }));
  const path = `/api/captures/${source.id}/suggestions`;
  expect((await invalid.request(path, { method: 'POST', headers })).status).toBe(502);
  expect(await (await app.request(path, { headers })).json()).toEqual([]);
});

it('reports configuration required without an API key and leaves listing available', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  const source = await capture();
  const path = `/api/captures/${source.id}/suggestions`;
  const response = await createApp().request(path, { method: 'POST', headers });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'AI configuration required: set OPENAI_API_KEY on the server.' });
  expect(await (await createApp().request(path, { headers })).json()).toEqual([]);
});

it('contains provider failures and exposes no upstream error or credentials', async () => {
  const source = await capture();
  const failed = createApp(async () => { throw new Error('secret upstream details'); });
  const response = await failed.request(`/api/captures/${source.id}/suggestions`, { method: 'POST', headers });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: 'Suggestion generation failed. Please try again.' });
});

it.each(['inbox', 'document', 'project', 'issue'])('allows a pending %s proposal without organizing the source', async (type) => {
  const source = await capture();
  const provider = createApp(async () => ({ output: { title: 'Proposed title', type, targetId: null }, model: { provider: 'fake', name: 'deterministic-v1' } }));
  const before = await unchangedTables();
  const response = await provider.request(`/api/captures/${source.id}/suggestions`, { method: 'POST', headers });
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ type, status: 'pending' });
  expect(await unchangedTables()).toEqual(before);
});
