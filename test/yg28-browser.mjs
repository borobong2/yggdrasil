// YG-28 recurring todo acceptance. Start the fixture first:
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg28 npx tsx test/yg28-browser-server.ts
// then: node test/yg28-browser.mjs [screenshot-dir]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3028';
const shots = process.argv[2] ?? 'tmp/yg28-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const card = (title, status = 'todo') => page.locator(`section[data-status="${status}"] li[data-issue-id]`, { hasText: title });
await page.goto(`${base}/#/board`);
await card('제2의 월급 스터디').waitFor();
assert.equal(await card('제2의 월급 스터디').locator('.badge', { hasText: '반복' }).count(), 1);
assert.equal(await card('가계부 정리').locator('.badge', { hasText: '반복' }).count(), 0);
pass('반복 badge on recurring cards only');
await page.screenshot({ path: `${shots}/desktop-board.png` });

await card('제2의 월급 스터디').locator('button').first().click();
const dialog = page.getByRole('dialog');
assert.equal(await dialog.getByLabel('반복 주기').inputValue(), 'weekly');
assert.equal(await dialog.getByRole('button', { name: '월', exact: true }).getAttribute('aria-pressed'), 'true');
assert.equal(await dialog.getByLabel('반복 시각').inputValue(), '10:00');
assert.equal(await dialog.getByLabel('마감 시각').inputValue(), '21:00');
await dialog.getByText('매주 월 10:00 ·').waitFor();
pass('detail shows rule (Mon 10:00) and this occurrence’s exception (21:00)');
await page.screenshot({ path: `${shots}/desktop-detail.png` });
await dialog.getByRole('button', { name: '완료 처리' }).click();
await dialog.waitFor({ state: 'detached' });
await card('제2의 월급 스터디', 'done').waitFor();
await card('제2의 월급 스터디', 'todo').waitFor();
pass('completing creates the next occurrence on the board');

await card('딥러닝 스터디').locator('button').first().click();
await dialog.getByRole('button', { name: '금', exact: true }).click();
await dialog.getByRole('button', { name: '저장' }).click();
await dialog.waitFor({ state: 'detached' });
const issues = await (await fetch(`${base}/api/issues`)).json();
const deep = issues.find((issue) => issue.title === '딥러닝 스터디');
assert.deepEqual(deep.recurrence.weekdays, ['wed', 'fri']);
pass('rule edit saved (수·금)');
await card('딥러닝 스터디').locator('button').first().click();
await dialog.getByLabel('반복 주기').selectOption('monthly');
await dialog.getByLabel('반복 날짜').fill('31');
await page.screenshot({ path: `${shots}/desktop-detail-monthly.png` });
await dialog.getByRole('button', { name: '취소' }).click();

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.goto(`${base}/#/board`);
await phone.locator('section[data-status="todo"] li[data-issue-id]', { hasText: '딥러닝 스터디' }).waitFor();
await phone.screenshot({ path: `${shots}/mobile-board.png` });
await phone.locator('section[data-status="todo"] li[data-issue-id]', { hasText: '딥러닝 스터디' }).locator('button').first().click();
await phone.getByRole('dialog').getByRole('group', { name: '반복 요일' }).scrollIntoViewIfNeeded();
await phone.screenshot({ path: `${shots}/mobile-detail.png` });
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page scroll');
pass('mobile board + detail');
await browser.close();
