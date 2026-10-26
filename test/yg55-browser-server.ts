// Disposable YG-55 acceptance data only; never use an existing owner or production database.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { createTodo } from '../src/server/todos.js';
const url = new URL(process.env.DATABASE_URL!);
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.equal(url.pathname, '/yggdrasil_yg55');
process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const owner = process.env.YGGDRASIL_DEV_OWNER_ID;
for (const [title, time, estimate] of [['겹침 A', '09:00', 90], ['겹침 B', '09:15', 60], ['겹침 C', '09:30', 60], ['독립 전체 폭 긴 제목이 잘려도 상세에서 모두 확인 가능한 작업', '12:00', 60], ['자정 예정', '00:00', 30], ['자정 경계', '23:45', 90]] as const)
  await createTodo(owner, { area: '개인', title, scheduledAt: `2026-10-26T${time}:00+09:00`, estimateMinutes: estimate });
await createTodo(owner, { area: '개인', title: '실제 마감 시점', dueAt: '2026-10-26T14:00:00+09:00', estimateMinutes: 180 });
for (let i = 0; i < 9; i++) await createTodo(owner, { area: '개인', title: `종일 ${i}`, scheduledAt: '2026-10-26' });
await createTodo(owner, { area: '개인', title: '예정 없음' });
await createTodo(owner, { area: '개인', title: '반복 예정', scheduledAt: '2026-10-25T10:00:00+09:00', recurrence: { freq: 'daily', time: '10:00' } });
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3055 }, () => console.log('YG-55 acceptance http://127.0.0.1:3055'));
