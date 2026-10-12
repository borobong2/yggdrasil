// YG-22 board acceptance. Start the fixture first:
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg22 npx tsx test/board-browser-server.ts
// then: node test/yg22-board-browser.mjs [screenshot-dir]
// CHROME_PATH overrides the Chromium binary when playwright-core's pinned build is not installed.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3022';
const shots = process.argv[2] ?? 'tmp/yg22-screens';
mkdirSync(shots, { recursive: true });
const api = async (path, method = 'GET', body) => {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  assert.ok(response.ok, `${method} ${path} → ${response.status}`);
  return response.json();
};

// Seed: two areas, a few todos per column, seven done items for 더보기.
const epics = {};
for (const area of ['커리어', '개인']) epics[area] = (await api('/api/epics', 'POST', { title: '일반', goalId: (await api('/api/goals', 'POST', { title: area })).id })).id;
const ids = {};
async function seed(title, area, status, priority = 'p3') {
  const issue = await api('/api/issues', 'POST', { title, epicId: epics[area], priority });
  if (status !== 'backlog') await api(`/api/issues/${issue.id}/move`, 'PATCH', { status, position: 999 });
  ids[title] = issue.id;
}
for (const [title, area, status, priority] of [['이력서 업데이트', '커리어', 'todo', 'p1'], ['포트폴리오 정리', '커리어', 'todo', 'p2'], ['병원 예약', '개인', 'todo'],
  ['블로그 초안', '커리어', 'doing', 'p2'], ['책장 정리', '개인', 'backlog', 'p4'], ['면접 준비', '커리어', 'backlog']]) await seed(title, area, status, priority);
for (let index = 1; index <= 7; index++) await seed(`완료한 일 ${index}`, '개인', 'done');
await api(`/api/todos/${ids['병원 예약']}`, 'PATCH', { hold: 'waiting', holdReason: '예약 문자 대기' });

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const column = (status) => page.locator(`section[data-status="${status}"]`);
const titles = async (status) => column(status).locator('li[data-issue-id] strong').allTextContents();
const card = (title) => page.locator('li[data-issue-id]', { hasText: title }).first();
const moved = () => page.waitForResponse((response) => response.url().includes('/move') && response.request().method() === 'PATCH');
const pass = (label) => console.log(`PASS ${label}`);

await page.goto(`${base}/#/board`);
await column('todo').waitFor();
assert.deepEqual(await titles('todo'), ['이력서 업데이트', '포트폴리오 정리', '병원 예약']);
assert.equal((await titles('done')).length, 5);
await page.getByRole('button', { name: '더보기 (2개)' }).click();
assert.equal((await titles('done')).length, 7);
await page.getByRole('button', { name: '최근 것만 보기' }).click();
pass('columns render; done shows 5 recent with 더보기');
await page.screenshot({ path: `${shots}/desktop-board.png` });

async function drag(from, to, { shot, offsetY = 0 } = {}) {
  const [a, b] = [await from.boundingBox(), await to.boundingBox()];
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + offsetY, { steps: 15 });
  if (shot) await page.screenshot({ path: shot });
  const response = moved();
  await page.mouse.up();
  return response;
}

// Mouse: across columns, then within a column.
let response = await drag(card('포트폴리오 정리'), card('블로그 초안'), { shot: `${shots}/desktop-drag.png` });
assert.equal(response.status(), 200);
assert.ok((await titles('doing')).includes('포트폴리오 정리'));
assert.ok(!(await titles('todo')).includes('포트폴리오 정리'));
pass('mouse drag moves a card to another column');
response = await drag(card('병원 예약'), card('이력서 업데이트'), { offsetY: -10 });
assert.deepEqual(await titles('todo'), ['병원 예약', '이력서 업데이트']);
pass('mouse drag reorders within a column');
assert.equal(await page.locator('dialog[open]').count(), 0, 'a drag must not open the detail panel');

// Keyboard: Space picks up, arrows move, Space drops; screen-reader live region narrates.
await card('이력서 업데이트').locator('button').first().focus();
await page.keyboard.press('Space');
assert.match(await page.locator('[id^="DndLiveRegion"]').textContent(), /이력서 업데이트 카드를 들었습니다/);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
response = moved();
await page.keyboard.press('Space');
assert.equal((await response).status(), 200);
assert.ok((await titles('doing')).includes('이력서 업데이트'), `doing: ${await titles('doing')}`);
assert.match(await page.locator('[id^="DndLiveRegion"]').textContent(), /놓았습니다/);
pass('keyboard pick up → arrow → drop moves across columns with announcements');
await page.keyboard.press('Escape');

const before = { todo: await titles('todo'), doing: await titles('doing') };
await page.reload();
await column('todo').waitFor();
assert.deepEqual({ todo: await titles('todo'), doing: await titles('doing') }, before);
pass('order survives reload');

// Failure rolls back and explains.
await page.route('**/api/issues/*/move', (route) => route.fulfill({ status: 500, body: '{}' }));
await card('병원 예약').getByRole('button', { name: '병원 예약 메뉴' }).click();
await page.getByRole('group', { name: '상태 이동' }).getByRole('button', { name: '완료' }).click();
await page.getByRole('alert').filter({ hasText: '원래 자리로 되돌렸습니다' }).waitFor();
assert.ok((await titles('todo')).includes('병원 예약'));
await page.unroute('**/api/issues/*/move');
pass('failed move rolls back with an error message');

// Menu fallback works.
response = moved();
await card('책장 정리').getByRole('button', { name: '책장 정리 메뉴' }).click();
await page.getByRole('group', { name: '상태 이동' }).getByRole('button', { name: '할 일' }).click();
await response;
assert.equal((await titles('todo'))[0], '책장 정리');
pass('… menu moves a card');

// Detail panel: edit fields, persist, complete.
await card('면접 준비').locator('button').first().click();
const dialog = page.getByRole('dialog', { name: '면접 준비' });
await dialog.waitFor();
await dialog.getByLabel('제목').fill('면접 준비 (1차)');
await dialog.getByLabel('우선순위').selectOption('p1');
await dialog.getByLabel('보류').selectOption('blocked');
await dialog.getByLabel('보류 사유').fill('일정 회신 대기');
await dialog.getByLabel('마감일').fill('2026-10-30');
await dialog.getByLabel('예정일').fill('2026-10-20');
await dialog.getByLabel('예상 시간 (분)').fill('90');
await dialog.getByLabel('메모').fill('자기소개 3분 버전');
await page.screenshot({ path: `${shots}/desktop-detail.png` });
await dialog.getByRole('button', { name: '저장' }).click();
await dialog.waitFor({ state: 'detached' });
assert.match(await card('면접 준비 (1차)').textContent(), /P1.*막힘/);
await page.keyboard.press('Tab');
await card('면접 준비 (1차)').locator('button').first().focus();
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor();
pass('Enter opens detail');
await page.keyboard.press('Escape');
await page.reload();
await card('면접 준비 (1차)').locator('button').first().click();
assert.equal(await page.getByLabel('마감일').inputValue(), '2026-10-30');
assert.equal(await page.getByLabel('보류 사유').inputValue(), '일정 회신 대기');
assert.equal(await page.getByLabel('예상 시간 (분)').inputValue(), '90');
await page.getByRole('button', { name: '완료 처리' }).click();
await page.getByRole('dialog').waitFor({ state: 'detached' });
assert.equal((await titles('done'))[0], '면접 준비 (1차)');
const activity = await api('/api/activities');
assert.ok(JSON.stringify(activity).includes('"via":"ui"'));
pass('detail edit persists after reload; 완료 처리 puts it on top of 완료');

// Filters.
await page.getByLabel('우선순위 필터').selectOption('p2');
assert.deepEqual((await titles('doing')).sort(), ['블로그 초안', '포트폴리오 정리']);
for (const status of ['backlog', 'todo', 'doing', 'done']) for (const text of await column(status).locator('li[data-issue-id]').allTextContents()) assert.match(text, /P2/);
await page.getByLabel('우선순위 필터').selectOption('');
await page.getByLabel('영역 필터').selectOption('커리어');
assert.equal((await titles('done')).length, 1);
await page.getByLabel('영역 필터').selectOption('');
await page.getByLabel('보류 필터').selectOption('waiting');
assert.deepEqual(await titles('todo'), ['병원 예약']);
await page.getByRole('button', { name: '필터 해제' }).click();
pass('area / priority / hold filters');

// Mobile 390×844: touch long-press drag, no page overflow, sheet detail.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const phone = await mobile.newPage();
await phone.goto(`${base}/#/board`);
await phone.locator('section[data-status="todo"]').waitFor();
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page overflow');
await phone.screenshot({ path: `${shots}/mobile-board.png` });
const cdp = await mobile.newCDPSession(phone);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
// A quick swipe scrolls instead of dragging.
const scroller = phone.getByLabel('Board columns');
const first = await phone.locator('section[data-status="todo"] li[data-issue-id]').first().boundingBox();
await touch('touchStart', first.x + 40, first.y + 20);
for (let step = 1; step <= 5; step++) await touch('touchMove', first.x + 40, first.y + 20 + step * 20);
await touch('touchEnd');
assert.equal(await phone.locator('[aria-pressed="true"], .opacity-40').count(), 0, 'swipe must not start a drag');
// Long-press then drag within the visible column.
const cards = phone.locator('section[data-status="todo"] li[data-issue-id]');
const order = await phone.locator('section[data-status="todo"] li[data-issue-id] strong').allTextContents();
const [top, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
await touch('touchStart', top.x + 40, top.y + 20);
await phone.waitForTimeout(400);
const touchMoved = phone.waitForResponse((r) => r.url().includes('/move'));
for (let step = 1; step <= 10; step++) await touch('touchMove', top.x + 40, top.y + 20 + (second.y + second.height - top.y) * step / 10);
await phone.screenshot({ path: `${shots}/mobile-drag.png` });
await touch('touchEnd');
assert.equal((await touchMoved).status(), 200);
assert.deepEqual(await phone.locator('section[data-status="todo"] li[data-issue-id] strong').allTextContents(), [order[1], order[0], ...order.slice(2)]);
pass('touch long-press drag reorders on mobile');
assert.ok(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth), 'columns scroll inside the board');
await phone.waitForTimeout(300); // dnd-kit swallows clicks briefly after a drop
await phone.locator('section[data-status="todo"] li[data-issue-id] button').first().tap();
await phone.getByRole('dialog').waitFor();
await phone.waitForTimeout(200);
await phone.screenshot({ path: `${shots}/mobile-detail.png` });
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
pass('mobile layout, sheet detail');

await browser.close();
console.log('YG-22 board browser acceptance passed');
