// Local-only browser fixture for YG-36/41; never imported by production. A fresh dev owner per start, seeded relative to today (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { createTodo, seoulDate } from '../src/server/todos.js';
import { setEpicPrefix } from '../src/server/ticket-keys.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/yggdrasil_yg\d+$/); // a per-ticket test DB, never the main one
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const day = (offset: number) => seoulDate(new Date(Date.now() + offset * 86_400_000));
const age = (id: string, days: number) => pool.query('UPDATE issues SET updated_at = now() - make_interval(days => $2) WHERE id = $1', [id, days]);

const seed = await createTodo(owner, { area: '프로젝트', epic: 'yggdrasil', title: '설정 화면 정리', prefix: null });
await setEpicPrefix(owner, seed.epicId, 'YG', 36);
await createTodo(owner, { area: '프로젝트', epic: 'yggdrasil', title: '방치 감지' }); // YG-36 via the epic default
await createTodo(owner, { area: '커리어', title: '보고서 제출', dueAt: day(0), priority: 'p2' });
await age((await createTodo(owner, { area: '개인', title: '운동화 수선', dueAt: day(-23) })).id, 47);
await age((await createTodo(owner, { area: '잡일', title: '보험 서류 정리', dueAt: day(-15) })).id, 2);
await age((await createTodo(owner, { area: '커리어', title: '포트폴리오 개편', status: 'doing' })).id, 40);
await age((await createTodo(owner, { area: '개인', title: '책장 정리', status: 'backlog' })).id, 90); // backlog: never stale
await createTodo(owner, { area: '잡일', title: '어제 마감', dueAt: day(-1) });
await pool.end();
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3036 }, () => console.log('yg36 fixture on http://127.0.0.1:3036'));
