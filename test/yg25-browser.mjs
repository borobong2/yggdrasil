// YG-25 오늘 + YG-26 일괄 정리 acceptance. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg25 npx tsx test/yg25-browser-server.ts
// then: node test/yg25-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3025';
const shots = process.argv[2] ?? 'tmp/yg25-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const section = (key, on = page) => on.locator(`section[data-section="${key}"]`);
const titles = async (key, on = page) => (await section(key, on).locator('li[data-todo-id] > button:not([role])').allTextContents());
// YG-34: 밀린 일 is a bucketed list (no checkboxes); its rows are buttons of title + age.
const lateTitles = async (on = page) => (await section('late', on).locator('li[data-todo-id] button > span:first-child').allTextContents());
const bulked = (on = page) => on.waitForResponse((response) => response.url().endsWith('/api/todos/bulk'));

await page.goto(base);
await section('today').waitFor();
assert.equal(await page.locator('nav[aria-label="주 메뉴"] a').first().textContent(), '오늘');
assert.equal(await page.locator('nav[aria-label="주 메뉴"] a[aria-current="page"]').textContent(), '오늘');
assert.deepEqual(await titles('today'), ['이력서 업데이트', '보고서 제출']);
assert.deepEqual((await lateTitles()).sort(), ['세금 신고', '책 반납', '헬스장 등록']);
assert.deepEqual(await titles('waiting'), ['추천서 회신']);
assert.deepEqual((await titles('week')).sort(), ['여행 계획', '치과 예약']);
assert.equal(await page.getByText('블로그 초안').count(), 0);
await page.screenshot({ path: `${shots}/desktop-today.png`, fullPage: true });
pass('오늘 is the first tab and default screen with 오늘 할 일 / 밀린 일 / 기다리는 중 / 이번 주 예정');

await section('today').getByRole('button', { name: /보고서 제출/ }).first().click();
const dialog = page.getByRole('dialog', { name: '보고서 제출' });
await dialog.waitFor();
await dialog.getByLabel('우선순위').selectOption('p3');
await dialog.getByRole('button', { name: '저장' }).click();
await dialog.waitFor({ state: 'detached' });
await page.waitForFunction(() => [...document.querySelectorAll('section[data-section="today"] li')].some((li) => li.textContent.includes('보고서 제출') && li.textContent.includes('P3')));
pass('card opens the board’s TodoDetail and saves');

let completed = page.waitForResponse((response) => response.url().includes('/complete'));
await page.getByRole('checkbox', { name: '이력서 업데이트 완료' }).click();
assert.ok(!(await titles('today')).includes('이력서 업데이트'), 'removed before the response');
assert.equal((await completed).status(), 200);
pass('완료 checkbox removes instantly (optimistic) and persists');

// Shift-range select (보고서 제출 → 치과 예약 spans 오늘 / 기다리는 중 / 이번 주), then select just 보고서 제출 → 미루기 내일, then undo.
await page.getByRole('checkbox', { name: '보고서 제출 선택' }).click();
await page.getByRole('checkbox', { name: '치과 예약 선택' }).click({ modifiers: ['Shift'] });
const toolbar = page.getByRole('toolbar', { name: '일괄 작업' });
assert.match(await toolbar.textContent(), /3개 선택/);
await toolbar.getByRole('button', { name: '선택 해제' }).click();
await page.getByRole('checkbox', { name: '보고서 제출 선택' }).click();
assert.match(await toolbar.textContent(), /1개 선택/);
await toolbar.getByRole('button', { name: '미루기' }).click();
await page.screenshot({ path: `${shots}/desktop-today-bulk.png` });
let response = bulked();
await toolbar.getByRole('button', { name: '내일', exact: true }).click();
assert.equal((await response).status(), 200);
await page.waitForFunction(() => document.querySelector('section[data-section="week"]')?.textContent?.includes('보고서 제출'));
assert.ok(!(await titles('today')).includes('보고서 제출'));
const toast = page.getByRole('status').filter({ hasText: '1개 내일로 미뤘습니다' });
await toast.waitFor();
await page.screenshot({ path: `${shots}/desktop-undo-toast.png` });
pass('Shift-range select across panels; 미루기 내일 moves a todo to 이번 주 예정');
response = bulked();
await toast.getByRole('button', { name: '되돌리기' }).click();
assert.equal((await response).status(), 200);
await page.reload();
await section('today').waitFor();
assert.ok((await titles('today')).includes('보고서 제출'));
pass('되돌리기 restores the previous due date in one call');

// Board: select two cards → 보류 막힘 + 사유.
await page.goto(`${base}/#/board`);
await page.locator('section[data-status="todo"]').waitFor();
await page.getByRole('checkbox', { name: '세금 신고 선택' }).click();
await page.getByRole('checkbox', { name: '블로그 초안 선택' }).click();
await toolbar.getByRole('button', { name: '보류' }).click();
await toolbar.getByLabel('보류 종류').selectOption('blocked');
await toolbar.getByLabel('보류 사유').fill('서류 대기');
await page.screenshot({ path: `${shots}/desktop-board-bulk.png` });
response = bulked();
await toolbar.getByRole('button', { name: '적용' }).click();
assert.equal((await response).status(), 200);
for (const title of ['세금 신고', '블로그 초안']) assert.match(await page.locator('li[data-issue-id]', { hasText: title }).textContent(), /막힘/);
response = bulked();
await page.getByRole('checkbox', { name: '책장 정리 선택' }).click();
await toolbar.getByRole('button', { name: '완료' }).click();
await response;
assert.ok((await page.locator('section[data-status="done"] li strong').allTextContents()).includes('책장 정리'));
const activity = JSON.stringify(await (await fetch(`${base}/api/activities`)).json());
assert.ok(activity.includes('"bulk":"hold"') && activity.includes('"via":"ui"'));
pass('board multi-select → 보류(막힘+사유) and 완료');

// Mobile 390: no overflow, select mode via long-press and via the 선택 button.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const phone = await mobile.newPage();
const noOverflow = async () => assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');
await phone.goto(base);
await section('today', phone).waitFor();
await noOverflow();
assert.equal(await phone.getByRole('checkbox', { name: '보고서 제출 선택' }).isVisible(), false, 'select boxes hidden until select mode');
await phone.screenshot({ path: `${shots}/mobile-today.png`, fullPage: true });
const cdp = await mobile.newCDPSession(phone);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const row = await section('today', phone).locator('li').first().boundingBox();
await touch('touchStart', row.x + 120, row.y + 20);
await phone.waitForTimeout(650);
await touch('touchEnd');
await phone.getByRole('toolbar', { name: '일괄 작업' }).waitFor();
await phone.getByRole('tab', { name: /예정/ }).tap(); // YG-34 mobile tabs; the selection survives switching
await section('week', phone).locator('li').first().locator('> button:not([role])').tap();
assert.match(await phone.getByRole('toolbar', { name: '일괄 작업' }).textContent(), /2개 선택/);
await phone.getByRole('toolbar', { name: '일괄 작업' }).getByRole('button', { name: '미루기' }).tap();
await noOverflow();
await phone.screenshot({ path: `${shots}/mobile-today-bulk.png` });
response = bulked(phone);
await phone.getByRole('button', { name: '다음 주 월요일' }).tap();
assert.equal((await response).status(), 200);
await phone.getByRole('status').filter({ hasText: '다음 주 월요일로 미뤘습니다' }).waitFor();
pass('mobile long-press enters select mode; tap adds; 미루기 다음 주 월요일');

await phone.goto(`${base}/#/board`);
await phone.locator('section[data-status="todo"]').waitFor();
await phone.getByRole('button', { name: '선택', exact: true }).tap();
await phone.locator('li[data-issue-id] button[aria-roledescription]').first().tap();
await phone.getByRole('toolbar', { name: '일괄 작업' }).waitFor();
assert.equal(await phone.locator('dialog[open]').count(), 0, 'select mode tap must not open detail');
await noOverflow();
await phone.screenshot({ path: `${shots}/mobile-board-select.png` });
pass('mobile board select mode, 390px without overflow');

await browser.close();
console.log('YG-25/26 browser acceptance passed');
