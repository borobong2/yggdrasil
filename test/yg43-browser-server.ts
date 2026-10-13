// Local-only browser fixture for YG-43; never imported by production. A fresh dev owner per start, seeded in this week (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { createTodo, seoulDate, updateTodo, type TodoInput } from '../src/server/todos.js';
import { addDays, weekStart } from '../src/contracts/review.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg43');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const monday = weekStart(new Date());
const today = seoulDate(new Date());
const done = async (input: TodoInput, day: string) => updateTodo(owner, (await createTodo(owner, input)).id, { status: 'done', completedAt: day });

await done({ area: '프로젝트', epic: 'yggdrasil', title: '주간 회고 화면', estimateMinutes: 120, actualMinutes: 180 }, monday);
await done({ area: '프로젝트', epic: 'yggdrasil', title: '실제 시간 필드', estimateMinutes: 60, actualMinutes: 45 }, monday);
await done({ area: '커리어', title: '이력서 업데이트', estimateMinutes: 90, actualMinutes: 90 }, today);
await done({ area: '개인', title: '운동 3회', estimateMinutes: 30 }, today);
await done({ area: '잡일', title: '택배 반품' }, today);
await done({ area: '커리어', title: '지난주에 한 일', estimateMinutes: 10, actualMinutes: 10 }, addDays(monday, -3));
await createTodo(owner, { area: '커리어', title: '자기소개서 초안', dueAt: monday, priority: 'p2' });
await createTodo(owner, { area: '개인', title: '병원 예약', dueAt: addDays(monday, -1) });
await createTodo(owner, { area: '잡일', title: '다음 주 할 일', dueAt: addDays(monday, 8) });
const old = await createTodo(owner, { area: '개인', title: '책장 정리', status: 'todo' });
await pool.query("UPDATE issues SET updated_at = now() - interval '40 days' WHERE id = $1", [old.id]);
await pool.end();
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3043 }, () => console.log('yg43 fixture on http://127.0.0.1:3043'));
