// Local-only browser fixture for YG-25/26; never imported by production. A fresh dev owner per start, seeded relative to today (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { createTodo, seoulDate } from '../src/server/todos.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg25');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const day = (offset: number) => seoulDate(new Date(Date.now() + offset * 86_400_000));
for (const [title, area, extra] of [
  ['보고서 제출', '커리어', { dueAt: day(0), priority: 'p2' }], ['이력서 업데이트', '커리어', { priority: 'p1' }],
  ['헬스장 등록', '개인', { dueAt: day(-5) }], ['세금 신고', '잡일', { dueAt: day(-3) }], ['책 반납', '개인', { dueAt: day(-1) }],
  ['추천서 회신', '커리어', { hold: 'waiting', holdReason: '교수님 메일' }], ['치과 예약', '개인', { dueAt: day(3) }],
  ['여행 계획', '개인', { hold: 'scheduled', scheduledAt: day(2) }], ['블로그 초안', '커리어', { status: 'doing' }], ['책장 정리', '개인', { status: 'backlog' }]
] as const) await createTodo(owner, { area, title, ...extra });
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3025 }, () => console.log('yg25 fixture on http://127.0.0.1:3025'));
