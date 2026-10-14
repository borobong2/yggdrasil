// Local-only browser fixture for YG-47 (desktop width audit); never imported by production.
// A fresh dev owner per start with a little data in every tab, seeded relative to today (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { createTodo, seoulDate, updateTodo } from '../src/server/todos.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg47');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const day = (offset: number) => seoulDate(new Date(Date.now() + offset * 86_400_000));
const app = createApp();
const post = async (path: string, body: unknown) => (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

const titles = ['논문 추가 실험 결과 전달', '회사 백엔드 스프린트 — 트랜잭션 정리', 'LLM 6주차 퀴즈 응시', '오늘 탭 레이아웃 개선', '가계부 정리 + 작성', '대학원의 목표 정하기'];
for (const [index, title] of titles.entries()) await createTodo(owner, { area: ['개인', '커리어', '프로젝트'][index % 3], title, dueAt: day(0), priority: (['p1', 'p2', 'p3'] as const)[index % 3] });
await createTodo(owner, { area: '개인', title: '스터디 발표', hold: 'scheduled', scheduledAt: `${day(0)}T18:00:00+09:00` });
for (const [offset, title] of [[-2, '보험 서류 정리'], [-9, '대학원 지원서 초안'], [-50, '노트북 백업']] as const) await createTodo(owner, { area: '잡일', title, dueAt: day(offset) });
for (const [offset, title] of [[2, '치과 예약'], [4, '블로그 글 퇴고']] as const) await createTodo(owner, { area: '개인', title, dueAt: day(offset) });
await createTodo(owner, { area: '커리어', title: '포트폴리오 개편', status: 'doing' });
await updateTodo(owner, (await createTodo(owner, { area: '프로젝트', title: '주간 회고 화면', estimateMinutes: 120, actualMinutes: 150 })).id, { status: 'done', completedAt: day(0) });

const goal = await post('/api/goals', { title: '2026 하반기 커리어 정비' });
const epic = await post('/api/epics', { title: '이력서 & 지원', goalId: goal.id });
for (const title of ['이력서 경력 기술 업데이트', '포트폴리오 사이트 개편', '지원 회사 리스트업']) await post('/api/issues', { title, epicId: epic.id });
const epic2 = await post('/api/epics', { title: 'Yggdrasil', goalId: goal.id });
for (const title of ['PC 레이아웃 여백 정리', '문서 표 지원']) await post('/api/issues', { title, epicId: epic2.id });

const body = ['## 이번 주 목표', '', '- 오늘 탭 레이아웃을 넓은 화면에 맞게 다듬는다', '- 문서 편집기의 읽기 폭은 편안하게 유지한다', '',
  '넓은 모니터에서는 좌우 여백이 너무 많이 남는다는 피드백이 있었다. 데이터가 많은 화면은 가용 폭을 쓰고, 긴 글은 읽기 좋은 폭(약 800px)을 유지한다. 이 문단은 한 줄 길이를 확인하기 위해 일부러 길게 적었다.'].join('\n');
const doc = await post('/api/documents', { title: '주간 계획', body, icon: '🗓️' });
await post('/api/documents', { title: '하위 메모', parentId: doc.id });
await post('/api/documents', { title: '읽을거리', body: '- 논문 3편' });
await post('/api/captures', { text: '넓은 화면에서 오늘 탭 가운데 열이 더 넓었으면 좋겠다' });

const site = createApp(); // the seeding app's router is already built
site.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: site.fetch, hostname: '127.0.0.1', port: 3047 }, () => console.log(`yg47 fixture on http://127.0.0.1:3047 (doc ${doc.id})`));
