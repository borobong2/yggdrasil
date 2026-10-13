// YG-34 오늘 작업대 + 정리 모드 acceptance. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg34 npx tsx test/yg34-browser-server.ts
// then: node test/yg34-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3034';
const shots = process.argv[2] ?? 'tmp/yg34-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const api = async (path) => (await fetch(`${base}${path}`)).json();
const section = (page, key) => page.locator(`section[data-section="${key}"]`);
const box = async (page, key) => section(page, key).boundingBox();
const rowTitles = async (page, key) => (await section(page, key).locator('li[data-todo-id] > button:not([role])').allTextContents()).map((text) => text.replace(/^[A-Z]+-\d+/, ''));
const lateCount = async (page) => Number(await section(page, 'late').locator('h2 > span').first().textContent());
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');

const initial = await api('/api/todos/today');
assert.equal(initial.late.length, 13);
assert.equal(new Set(initial.late.map((todo) => todo.id)).size, 13);

// ── Desktop 1440: three columns side by side.
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(base);
await section(page, 'today').waitFor();
const [timeline, today, late] = [await box(page, 'timeline'), await box(page, 'today'), await box(page, 'late')];
assert.ok(timeline.x < today.x && today.x < late.x, 'timeline | today | late left to right');
assert.ok(Math.abs(timeline.y - today.y) < 2 && Math.abs(today.y - late.y) < 2, 'three columns share the top');
assert.ok(today.width > timeline.width, 'center column is the widest');
assert.equal(await page.getByRole('tablist', { name: '오늘 보기' }).isVisible(), false);
// 오늘 할 일: compact rows, P1 first, header P-count, no 밀린 일 inside.
const todayTitles = await rowTitles(page, 'today');
assert.deepEqual(todayTitles.slice(0, 2).sort(), ['논문 추가 실험 결과 전달', '회사 백엔드 2주 스프린트 — lab02 트랜잭션']);
assert.ok(!todayTitles.includes('보험 서류 정리') && !todayTitles.includes('책장 정리'));
assert.match(await section(page, 'today').locator('h2').textContent(), /P1 2 · P2 3 · P3 3/);
const rowHeight = (await section(page, 'today').locator('li').first().boundingBox()).height;
assert.ok(rowHeight <= 40, `one-line rows (~36px), got ${rowHeight}`);
// Timeline: timed only, with the now-line.
assert.deepEqual((await section(page, 'timeline').locator('[data-hour] button').allTextContents()).map((text) => text.slice(5)), ['LLM 퀴즈 준비', '제2의 월급 스터디']);
assert.equal(await section(page, 'timeline').locator('[data-now]').count(), 1);
// 밀린 일: one merged list in buckets, nothing shown twice on the page.
const bucket = (key) => section(page, 'late').locator(`[data-bucket="${key}"]`);
assert.equal(await lateCount(page), 13);
assert.match(await bucket('recent').textContent(), /어제~3일2/);
assert.match(await bucket('month').textContent(), /이번 달1/);
assert.match(await bucket('older').textContent(), /한 달 넘음10.*이력서 업데이트.*140일.*\+ 7개/);
const ids = await page.locator('section[data-section] li[data-todo-id]').evaluateAll((items) => items.map((item) => item.dataset.todoId));
assert.equal(ids.length, new Set(ids).size, 'no todo listed twice');
assert.equal(await page.getByText('마감 지남', { exact: true }).count(), 0);
assert.equal(await page.getByText('방치된 할 일').count(), 0);
await page.screenshot({ path: `${shots}/1-desktop-today.png` });
await bucket('older').getByRole('button', { name: '+ 7개' }).click();
assert.equal(await bucket('older').locator('li').count(), 10);
await bucket('older').getByRole('button', { name: '접기' }).click();
pass('1440: 타임라인 | 오늘 할 일 (one-line rows, P1 first) | 밀린 일 buckets — no duplicates');

// ── Tablet 1024: timeline across the top, then two columns.
const tablet = await browser.newPage({ viewport: { width: 1024, height: 800 } });
await tablet.goto(base);
await section(tablet, 'today').waitFor();
const [tTimeline, tToday, tLate] = [await box(tablet, 'timeline'), await box(tablet, 'today'), await box(tablet, 'late')];
assert.ok(tTimeline.y < tToday.y && Math.abs(tToday.y - tLate.y) < 2 && tToday.x < tLate.x, 'timeline on top, today | late below');
assert.ok(Math.abs(tTimeline.width - (tLate.x + tLate.width - tToday.x)) < 2, 'timeline spans both columns');
await noOverflow(tablet);
await tablet.screenshot({ path: `${shots}/3-tablet-1024.png`, fullPage: true });
pass('1024: two columns with the timeline spanning the top');

// ── Mobile 390: segmented tabs 오늘 / 밀린 일 / 예정.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const phone = await mobile.newPage();
await phone.goto(base);
const tabs = phone.getByRole('tablist', { name: '오늘 보기' });
await tabs.waitFor();
assert.equal(await section(phone, 'today').isVisible(), true);
assert.equal(await section(phone, 'late').isVisible(), false);
await noOverflow(phone);
await phone.screenshot({ path: `${shots}/4-mobile-today.png` });
await tabs.getByRole('tab', { name: /밀린 일/ }).tap();
assert.equal(await section(phone, 'late').isVisible(), true);
assert.equal(await section(phone, 'today').isVisible(), false);
await noOverflow(phone);
await phone.screenshot({ path: `${shots}/5-mobile-late.png` });
await tabs.getByRole('tab', { name: /예정/ }).tap();
assert.equal(await section(phone, 'waiting').isVisible(), true);
assert.equal(await section(phone, 'week').isVisible(), true);
await tabs.getByRole('tab', { name: /밀린 일/ }).tap();
await phone.getByRole('button', { name: '하나씩 정리' }).tap();
const phoneDialog = phone.getByRole('dialog', { name: '밀린 일 정리' });
await phoneDialog.waitFor();
const dialogBox = await phoneDialog.boundingBox();
assert.ok(dialogBox.width >= 389 && dialogBox.height >= 843, 'triage is full-screen on mobile');
assert.match(await phoneDialog.textContent(), /밀린 일 1 \/ 13 · 마감 140일 지남 · 커리어.*이력서 업데이트 \(스터디 준비\).*5개월 동안 그대로/);
await phone.screenshot({ path: `${shots}/6-mobile-triage.png` });
await phone.keyboard.press('Escape');
await phoneDialog.waitFor({ state: 'detached' });
pass('390: segmented tabs switch panes; 정리 모드 is full-screen; Esc closes');

// ── Desktop interactions: quick 내일 + undo, multi-select, 전부 백로그로 + undo.
const bulked = () => page.waitForResponse((response) => response.url().endsWith('/api/todos/bulk'));
const toast = page.locator('div[role="status"]').filter({ hasText: /되돌리기|미뤘습니다|옮겼습니다/ });
const row = section(page, 'today').locator('li', { hasText: '가계부 정리 + 작성' });
await row.hover();
let response = bulked();
await row.getByRole('button', { name: '내일', exact: true }).click();
assert.equal((await response).status(), 200);
await toast.filter({ hasText: '1개 내일로 미뤘습니다' }).waitFor();
await page.waitForFunction(() => document.querySelector('section[data-section="week"]')?.textContent?.includes('가계부 정리 + 작성'));
response = bulked();
await toast.getByRole('button', { name: '되돌리기' }).click();
await response;
await page.waitForFunction(() => document.querySelector('section[data-section="today"]')?.textContent?.includes('가계부 정리 + 작성'));
pass('hover 내일 moves a row to 이번 주 예정; toast 되돌리기 brings it back');

await page.getByRole('checkbox', { name: '논문 추가 실험 결과 전달 선택' }).click();
await page.getByRole('checkbox', { name: 'LLM 6주차 퀴즈 응시 선택' }).click({ modifiers: ['Shift'] });
const toolbar = page.getByRole('toolbar', { name: '일괄 작업' });
assert.match(await toolbar.textContent(), /3개 선택/);
await toolbar.getByRole('button', { name: '선택 해제' }).click();
await toolbar.waitFor({ state: 'detached' });
pass('YG-26 shift-range multi-select still works on the compact rows');

let completed = page.waitForResponse((response) => response.url().includes('/complete'));
await page.getByRole('checkbox', { name: '대학원의 목표 정하기 완료' }).click();
assert.ok(!(await rowTitles(page, 'today')).includes('대학원의 목표 정하기'), 'removed before the response');
assert.equal((await completed).status(), 200);
pass('round check completes instantly (optimistic) and persists');

response = bulked();
await page.getByRole('button', { name: '전부 백로그로' }).click();
assert.equal((await response).status(), 200);
await toast.filter({ hasText: '13개 백로그로 옮겼습니다' }).waitFor();
await section(page, 'late').getByText('밀린 일이 없습니다.').waitFor();
assert.equal((await api('/api/todos/today')).late.length, 0);
response = bulked();
await toast.getByRole('button', { name: '되돌리기' }).click();
await response;
// Undo is a change too: 포트폴리오 개편 was only stale for being untouched, so it is no longer 밀린 일 afterwards.
await page.waitForFunction(() => /밀린 일12/.test(document.querySelector('section[data-section="late"] h2')?.textContent ?? ''));
assert.equal((await api('/api/todos/today')).late.length, 12);
pass('전부 백로그로 empties 밀린 일; 되돌리기 restores them (12 overdue + the touched stale one leaves)');

// ── 정리 모드: keyboard D/T/W/B/H/A, U undo, finish screen.
await page.getByRole('button', { name: '하나씩 정리' }).click();
const dialog = page.getByRole('dialog', { name: '밀린 일 정리' });
await dialog.waitFor();
const card = () => dialog.locator('[data-triage-card]');
const cardTitle = async () => (await card().locator('p').nth(1).textContent()).replace(/^[A-Z]+-\d+/, '');
assert.match(await card().locator('p').first().textContent(), /^밀린 일 1 \/ 12 · 마감 140일 지남 · 커리어$/);
assert.equal(await cardTitle(), '이력서 업데이트 (스터디 준비)');
await page.screenshot({ path: `${shots}/2-desktop-triage.png` });
const decided = {};
const press = async (key, wait = true) => {
  const title = await cardTitle();
  const done = wait && page.waitForResponse((response) => /\/(bulk|complete|archive)$/.test(new URL(response.url()).pathname));
  await page.keyboard.press(key);
  if (wait) assert.equal((await done).status(), 200);
  decided[key] = title;
  return title;
};
await dialog.getByLabel('완료일: 마감일로').check();
await press('d'); // completes with completedAt = due date
assert.match(await card().locator('p').first().textContent(), /^밀린 일 2 \/ 12/);
await press('t');
await press('w');
await press('b');
await dialog.getByLabel('대기 사유').fill('서류 회신');
await dialog.getByLabel('대기 사유').evaluate((input) => input.blur());
await press('h');
const archivedTitle = await press('a');
assert.match(await dialog.locator('p[aria-live]').textContent(), new RegExp(`'${archivedTitle}' 보관`));
// U undoes the last decision (보관) and shows that card again.
const unarchived = page.waitForResponse((response) => response.url().endsWith('/unarchive'));
await page.keyboard.press('u');
assert.equal((await unarchived).status(), 200);
assert.equal(await cardTitle(), archivedTitle);
assert.match(await card().locator('p').first().textContent(), /^밀린 일 6 \/ 12/);
await press('a');
for (let i = 7; i <= 12; i++) await press('b');
await dialog.getByText('밀린 일 0 🎉').waitFor();
assert.match(await dialog.textContent(), /완료 1 · 오늘 1 · 다음 주 1 · 백로그 7 · 대기 1 · 보관 1/);
assert.equal(await page.evaluate(() => document.activeElement?.textContent), '닫기');
await page.screenshot({ path: `${shots}/2b-desktop-triage-finished.png` });
await dialog.getByRole('button', { name: '닫기', exact: true }).click();
await dialog.waitFor({ state: 'detached' });
await page.waitForFunction(() => /밀린 일0/.test(document.querySelector('section[data-section="late"] h2')?.textContent ?? ''));
pass('정리 모드: D/T/W/B/H/A decide and advance, U undoes, finish screen with counts, focus on 닫기');

// Persisted results.
const after = await api('/api/todos/today');
const where = (title) => ['today', 'waiting', 'week', 'late'].filter((key) => after[key].some((todo) => todo.title === title));
assert.equal(after.late.length, 0);
assert.deepEqual(where(decided.t), ['today']);
assert.deepEqual(where(decided.w), ['week']);
assert.deepEqual(where(decided.h), ['waiting']);
assert.equal(after.waiting.find((todo) => todo.title === decided.h).holdReason, '서류 회신');
for (const key of ['d', 'a']) assert.deepEqual(where(decided[key]), [], `${key} leaves 오늘`);
// API today still carries past-due backlog (MCP meaning); the screen hides it, checked via status here.
assert.ok(!where(decided.b).includes('late') && after.today.filter((todo) => todo.title === decided.b).every((todo) => todo.status === 'backlog'));
const activity = JSON.stringify(await api('/api/activities'));
assert.ok(activity.includes('"issue.archived"') && activity.includes('"issue.unarchived"') && activity.includes('"issue.completed"'));
pass('decisions persisted: 오늘 / 다음 주 / 대기(+사유) / 완료 / 백로그 / 보관');

await browser.close();
console.log('YG-34 browser acceptance passed');
