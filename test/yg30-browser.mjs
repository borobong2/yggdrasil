// YG-30 calendar acceptance. Start the fixture first (fresh owner each start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg30 npx tsx test/yg30-browser-server.ts
// then: node test/yg30-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3030';
const shots = process.argv[2] ?? 'tmp/yg30-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const day = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + offset * 86_400_000));
const kst = (iso) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); // 'YYYY-MM-DD HH:mm'
const todo = async (title) => (await (await fetch(`${base}/api/issues`)).json()).find((issue) => issue.title === title);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Seoul' });
const page = await context.newPage();
const patched = (target = page) => target.waitForResponse((response) => response.url().includes('/api/todos/') && response.request().method() === 'PATCH');
const chip = (title, scope = page) => scope.locator(`button[data-todo-id]`, { hasText: title }).first();
const cell = (date) => page.locator(`[data-day="${date}"]`);

async function drag(from, to, { dx = 0, dy = 0, shot } = {}) {
  const [a, b] = [await from.boundingBox(), await to.boundingBox()];
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 15 });
  if (shot) await page.screenshot({ path: shot });
  const response = patched();
  await page.mouse.up();
  assert.equal((await response).status(), 200);
  await page.waitForTimeout(150);
}

// Month: cells, overflow popover, overdue, ghosts, sidebar.
await page.goto(`${base}/#/calendar/month/${day(0)}`);
await chip('이력서 업데이트').waitFor();
assert.equal(await cell(day(3)).locator(':scope > ul button[data-todo-id]').count(), 2);
await cell(day(3)).getByRole('button', { name: '+3개 더' }).click();
assert.equal(await page.locator('[popover]:popover-open button[data-todo-id]').count(), 5);
await page.screenshot({ path: `${shots}/desktop-month-more.png` });
await page.keyboard.press('Escape');
assert.equal(await chip('세금 신고').locator('[data-late]').count(), 1);
assert.ok(await page.locator('[data-ghost]').count() >= 1, 'weekly ghosts in month');
assert.equal(await page.locator('[data-ghost][aria-roledescription]').count(), 0, 'ghosts are not draggable');
assert.equal(await page.getByRole('complementary', { name: '날짜 없음' }).locator('button[data-todo-id]').count(), 2);
assert.equal(await chip('면접 준비').locator('.badge', { hasText: '대기' }).count(), 1);
pass('month: 2 + "+3개 더" popover, overdue red, ghosts, hold badge, 날짜 없음 sidebar');
await page.screenshot({ path: `${shots}/desktop-month.png` });

// Drag day → day keeps the time.
await drag(chip('병원 예약'), cell(day(5)), { shot: `${shots}/desktop-month-drag.png` });
assert.equal(kst((await todo('병원 예약')).dueAt), `${day(5)} 10:30`);
await cell(day(5)).locator('button', { hasText: '병원 예약' }).waitFor();
pass('drag day → day keeps 10:30');

// Sidebar → calendar assigns dueAt (all-day); back to sidebar clears it with undo.
const sidebar = page.getByRole('complementary', { name: '날짜 없음' });
await drag(chip('책장 정리', sidebar), cell(day(6)));
assert.equal(kst((await todo('책장 정리')).dueAt), `${day(6)} 00:00`);
assert.equal(await sidebar.locator('button[data-todo-id]', { hasText: '책장 정리' }).count(), 0);
await drag(chip('책장 정리'), sidebar);
assert.equal((await todo('책장 정리')).dueAt, null);
await sidebar.locator('button[data-todo-id]', { hasText: '책장 정리' }).waitFor();
const undo = patched();
await page.getByRole('status').getByRole('button', { name: '되돌리기' }).click();
await undo;
await cell(day(6)).locator('button', { hasText: '책장 정리' }).waitFor();
assert.equal(kst((await todo('책장 정리')).dueAt), `${day(6)} 00:00`);
pass('sidebar → calendar sets dueAt; back to sidebar clears it; 되돌리기 restores');

// Keyboard: Space picks up, → moves a day, Space drops. 블로그 초안 has only scheduledAt, so scheduledAt moves.
await chip('블로그 초안').focus();
await page.keyboard.press('Space');
assert.match(await page.locator('[id^="DndLiveRegion"]').textContent(), /블로그 초안 일정을 들었습니다/);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
let response = patched();
await page.keyboard.press('Space');
assert.equal((await response).status(), 200);
const blog = await todo('블로그 초안');
assert.equal(kst(blog.scheduledAt), `${day(2)} 00:00`);
assert.equal(blog.dueAt, null);
pass('keyboard move (Space, →, Space) shifts scheduledAt by a day');

// Failure rolls back.
await page.route('**/api/todos/*', (route) => route.request().method() === 'PATCH' ? route.fulfill({ status: 500, body: '{}' }) : route.continue());
await page.mouse.move(0, 0);
const before = await todo('세금 신고');
const [a, b] = [await chip('세금 신고').boundingBox(), await cell(day(-2)).boundingBox()];
await page.mouse.move(a.x + 20, a.y + 8); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 18, { steps: 3 });
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 }); await page.mouse.up();
await page.getByRole('status').filter({ hasText: '원래 날짜로 되돌렸습니다' }).waitFor();
await cell(day(-3)).locator('button', { hasText: '세금 신고' }).waitFor();
assert.equal((await todo('세금 신고')).dueAt, before.dueAt);
await page.unroute('**/api/todos/*');
pass('failed move rolls back with a message');

// Click opens TodoDetail.
await page.waitForTimeout(300);
await chip('이력서 업데이트').click();
await page.getByRole('dialog', { name: '이력서 업데이트' }).waitFor();
await page.keyboard.press('Escape');
pass('click opens detail');

// Week: switcher + hash + reload, drop on a time slot (15-minute snap), all-day row.
await page.getByRole('group', { name: '보기' }).getByRole('button', { name: '주' }).click();
await page.waitForURL(`**/#/calendar/week/${day(0)}`);
await page.reload();
assert.equal(await page.getByRole('button', { name: '주', exact: true }).getAttribute('aria-pressed'), 'true');
await chip('이력서 업데이트').waitFor();
pass('view + date in hash survive reload');
await drag(chip('이력서 업데이트'), page.locator(`[data-slot="${day(0)}T9"]`), { shot: `${shots}/desktop-week-drag.png` });
const resume = kst((await todo('이력서 업데이트')).dueAt);
assert.match(resume, new RegExp(`^${day(0)} 09:(00|15|30|45)$`), resume);
pass(`drop on time slot sets ${resume}`);
await drag(chip('면접 준비'), page.getByRole('list', { name: new RegExp('종일') }).nth((new Date(`${day(1)}T00:00:00Z`).getUTCDay() + 6) % 7));
assert.equal(kst((await todo('면접 준비')).dueAt), `${day(1)} 00:00`);
pass('drop on the all-day row makes it all-day on that date');
await page.screenshot({ path: `${shots}/desktop-week.png` });

// Done toggle.
assert.equal(await chip('끝난 일').count(), 0);
await page.getByLabel('완료 표시').check();
await chip('끝난 일').waitFor();
assert.equal(await chip('끝난 일').locator('.line-through').count(), 1);
await page.getByLabel('완료 표시').uncheck();
pass('완료 표시 shows done with strikethrough');

for (const mode of ['3day', 'day', 'list']) {
  await page.goto(`${base}/#/calendar/${mode}/${day(0)}`);
  await page.locator('button[data-todo-id]').first().waitFor();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${shots}/desktop-${mode}.png` });
}
assert.ok(await page.locator('[data-agenda-day]').count() >= 3);
assert.equal(await page.locator('[data-agenda-day]').first().getAttribute('data-agenda-day'), day(0));
pass('3일 / 일 / 목록 render; list has date headers from today');

// Mobile 390×844: default 3일, no page overflow, long-press drag, bottom sheet.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, timezoneId: 'Asia/Seoul' });
const phone = await mobile.newPage();
await phone.goto(`${base}/#/calendar`);
await phone.waitForURL(`**/#/calendar/3day/${day(0)}`);
await phone.locator('button[data-todo-id]').first().waitFor();
const noOverflow = () => phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
assert.ok(await noOverflow(), 'no horizontal page overflow');
await phone.screenshot({ path: `${shots}/mobile-3day.png` });
const cdp = await mobile.newCDPSession(phone);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
const source = await phone.locator('button[data-todo-id]', { hasText: '이력서 업데이트' }).boundingBox();
const target = await phone.locator(`[data-slot="${day(1)}T11"]`).boundingBox();
await touch('touchStart', source.x + 10, source.y + 8);
await phone.waitForTimeout(400);
const touchMoved = patched(phone);
for (let step = 1; step <= 10; step++) await touch('touchMove', source.x + 10 + (target.x + 20 - source.x - 10) * step / 10, source.y + 8 + (target.y + 4 - source.y - 8) * step / 10);
await phone.screenshot({ path: `${shots}/mobile-drag.png` });
await touch('touchEnd');
assert.equal((await touchMoved).status(), 200);
assert.match(kst((await todo('이력서 업데이트')).dueAt), new RegExp(`^${day(1)} 1[01]:`));
pass('touch long-press drag to a time slot on mobile');
await phone.waitForTimeout(300); // dnd-kit swallows clicks briefly after a drop
await phone.getByRole('button', { name: /날짜 없음/ }).click();
await phone.locator('[data-undated] button[data-todo-id]').first().waitFor();
await phone.screenshot({ path: `${shots}/mobile-undated-sheet.png` });
await phone.getByRole('button', { name: /날짜 없음/ }).click();
for (const mode of ['month', 'week', 'day', 'list']) {
  await phone.getByRole('group', { name: '보기' }).getByRole('button', { name: { month: '월', week: '주', day: '일', list: '목록' }[mode], exact: true }).click();
  await phone.waitForURL(`**/#/calendar/${mode}/**`);
  await phone.waitForTimeout(250);
  assert.ok(await noOverflow(), `${mode}: no horizontal page overflow`);
  await phone.screenshot({ path: `${shots}/mobile-${mode}.png` });
}
pass('mobile views fit 390px; 날짜 없음 bottom sheet');

await browser.close();
console.log('YG-30 calendar browser acceptance passed');
