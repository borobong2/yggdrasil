// Local-only browser fixture for YG-23; never imported by production.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg23');
process.env.YGGDRASIL_DEV_OWNER_ID = '00000000-0000-4000-8000-000000000023';
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3023 });

// Seed one mentionable todo for the fixture owner (idempotent by title).
const json = { 'content-type': 'application/json' };
const issues = await (await app.request('/api/issues')).json() as { title: string }[];
if (!issues.some((issue) => issue.title === '자동 저장 확인')) {
  const goal = await (await app.request('/api/goals', { method: 'POST', headers: json, body: JSON.stringify({ title: '문서 개선' }) })).json();
  const epic = await (await app.request('/api/epics', { method: 'POST', headers: json, body: JSON.stringify({ title: '노션형 문서', goalId: goal.id }) })).json();
  await app.request('/api/issues', { method: 'POST', headers: json, body: JSON.stringify({ title: '자동 저장 확인', epicId: epic.id }) });
}
