// Local-only browser fixture for YG-34 (also serves the updated YG-25/36 today checks); never imported by production.
// A fresh dev owner per start, seeded relative to today (Asia/Seoul).
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { createTodo, seoulDate } from '../src/server/todos.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg34');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const day = (offset: number) => seoulDate(new Date(Date.now() + offset * 86_400_000));
const at = (offset: number, time: string) => `${day(offset)}T${time}:00+09:00`;
type Seed = [string, string, Record<string, unknown>?];
const seeds: Seed[] = [
  // 오늘 할 일
  ['논문 추가 실험 결과 전달', '개인', { priority: 'p1', dueAt: day(0) }],
  ['회사 백엔드 2주 스프린트 — lab02 트랜잭션', '커리어', { priority: 'p1' }],
  ['제2의 월급 스터디', '개인', { priority: 'p2', dueAt: at(0, '21:00'), recurrence: { freq: 'daily', time: '21:00' } }],
  ['LLM 6주차 퀴즈 응시', '개인', { priority: 'p2', dueAt: day(0) }],
  ['오늘 탭 레이아웃 개선', '프로젝트', { priority: 'p2', dueAt: day(0), prefix: 'YG' }],
  ['대학원의 목표 정하기', '개인', { priority: 'p3', dueAt: day(0) }],
  ['가계부 정리 + 작성', '잡일', { priority: 'p3', dueAt: day(0) }],
  ['LLM 퀴즈 준비', '개인', { hold: 'scheduled', scheduledAt: at(0, '18:00') }],
  // 밀린 일 (13): 마감 지남 + 방치
  ['보험 서류 정리', '잡일', { dueAt: day(-1) }],
  ['대학원 지원서 초안', '개인', { dueAt: day(-3) }],
  ['frontend-lab 첫 학습', '커리어', { dueAt: day(-8), priority: 'p2' }],
  ['이력서 업데이트 (스터디 준비)', '커리어', { dueAt: day(-140), priority: 'p1' }],
  ['KIS Developers API 신청', '수익화', { dueAt: day(-134) }],
  ['6월 이사 전 준비', '부동산', { dueAt: day(-125) }],
  ['운동화 수선', '개인', { dueAt: day(-90) }],
  ['블로그 글 퇴고', '커리어', { dueAt: day(-75) }],
  ['치과 정기 검진 예약', '개인', { dueAt: day(-60) }],
  ['노트북 백업', '잡일', { dueAt: day(-45) }],
  ['전입 신고 확인', '부동산', { dueAt: day(-40) }],
  ['독서 모임 발제문', '개인', { dueAt: day(-35) }],
  ['포트폴리오 개편', '커리어', { status: 'doing' }],
  // 기다리는 중 · 이번 주 예정
  ['ML 중간 과제', '개인', { hold: 'waiting', holdReason: '10/17 공지' }],
  ['공저자 피드백 반영', '개인', { hold: 'waiting' }],
  ['딥러닝 6주차 음성', '개인', { hold: 'waiting' }],
  ['딥러닝 스터디', '개인', { dueAt: at(1, '20:00') }],
  ['ML 수업 투표', '개인', { dueAt: day(4) }],
  ['책장 정리', '개인', { status: 'backlog', dueAt: day(-20) }] // backlog: never 밀린 일
];
for (const [title, area, extra] of seeds) {
  const todo = await createTodo(owner, { area, title, ...extra });
  if (title === '포트폴리오 개편') await pool.query("UPDATE issues SET updated_at = now() - interval '52 days' WHERE id = $1", [todo.id]);
  if (title.startsWith('이력서')) await pool.query("UPDATE issues SET updated_at = now() - interval '150 days' WHERE id = $1", [todo.id]);
}
await pool.end();
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3034 }, () => console.log('yg34 fixture on http://127.0.0.1:3034'));
