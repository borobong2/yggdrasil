// Local-only browser fixture for YG-28; never imported by production. Seeds the two study series for a fresh dev owner.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { createTodo, updateTodo } from '../src/server/todos.js';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg28');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const study = await createTodo(owner, { area: '국민대', title: '제2의 월급 스터디', dueAt: '2026-10-12T10:00:00+09:00', recurrence: { freq: 'weekly', weekdays: ['mon'], time: '10:00' } });
await updateTodo(owner, study.id, { dueAt: '2026-10-13T21:00:00+09:00' }); // this week only
await createTodo(owner, { area: '국민대', title: '딥러닝 스터디', recurrence: { freq: 'weekly', weekdays: ['wed'], time: '20:00' } });
await createTodo(owner, { area: '잡일', title: '가계부 정리', dueAt: '2026-10-20' });
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3028 }, () => console.log('yg28 fixture on http://127.0.0.1:3028'));
