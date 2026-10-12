// Local-only browser fixture for YG-30; never imported by production. Seeds a fresh dev owner around today (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { completeTodo, createTodo, seoulDate, type TodoInput } from '../src/server/todos.js';

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg30');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const day = (offset: number) => seoulDate(new Date(Date.now() + offset * 86_400_000));
const seed = (title: string, fields: Partial<TodoInput>, area = '개인') => createTodo(owner, { area, title, ...fields });
await seed('이력서 업데이트', { dueAt: day(0), priority: 'p1' }, '커리어');
await seed('면접 준비', { dueAt: `${day(0)}T14:00:00+09:00`, priority: 'p2', hold: 'waiting', holdReason: '일정 회신' }, '커리어');
await seed('병원 예약', { dueAt: `${day(2)}T10:30:00+09:00`, priority: 'p3' });
await seed('블로그 초안', { scheduledAt: day(1), priority: 'p2' }, '커리어');
await seed('세금 신고', { dueAt: day(-3), priority: 'p1' });
for (let index = 1; index <= 5; index++) await seed(`정리 ${index}`, { dueAt: day(3), priority: 'p4' });
await seed('책장 정리', {});
await seed('아이디어 메모', { priority: 'p3' });
await seed('딥러닝 스터디', { recurrence: { freq: 'weekly', weekdays: ['wed'], time: '20:00' } }, '국민대');
await completeTodo(owner, (await seed('끝난 일', { dueAt: day(0) })).id);
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3030 }, () => console.log(`yg30 fixture on http://127.0.0.1:3030 (today ${day(0)})`));
