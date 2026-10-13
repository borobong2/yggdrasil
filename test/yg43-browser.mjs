// YG-43 주간 회고 acceptance. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg43 npx tsx test/yg43-browser-server.ts
// then: node test/yg43-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3043';
const shots = process.argv[2] ?? 'tmp/yg43-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const section = (id) => page.locator(`section[data-section="${id}"]`);

await page.goto(`${base}/#/review`);
await section('completed').locator('li').first().waitFor();
assert.deepEqual((await section('completed').locator('li strong').allTextContents()).sort(), ['실제 시간 필드', '운동 3회', '이력서 업데이트', '주간 회고 화면', '택배 반품']);
assert.match(await section('completed').textContent(), /프로젝트 2/);
assert.match(await section('minutes').textContent(), /예상 270분 → 실제 315분 · 1\.17배 \(3건\)/);
assert.match(await section('minutes').textContent(), /\+60분 초과/);
assert.deepEqual(await section('unfinished').locator('li strong').allTextContents(), ['자기소개서 초안', '병원 예약']);
assert.match(await section('stale').textContent(), /1건/);
assert.equal(await page.locator('nav[aria-label="주 메뉴"] a[aria-current="page"]', { hasText: '회고' }).count(), 1);
await page.screenshot({ path: `${shots}/1-review-desktop.png`, fullPage: true });
pass('회고 shows completed by area, estimate vs actual, unfinished, stale');

await section('completed').getByRole('button', { name: /운동 3회/ }).click();
const dialog = page.getByRole('dialog', { name: '운동 3회' });
await dialog.getByLabel('실제 시간 (분)').fill('40');
await page.screenshot({ path: `${shots}/2-detail-actual.png` });
await dialog.getByRole('button', { name: '저장' }).click();
await page.waitForFunction(() => /4건\)/.test(document.querySelector('section[data-section="minutes"]')?.textContent ?? ''));
pass('실제 시간 saved from TodoDetail updates the comparison');

await page.getByRole('button', { name: '이전 주' }).click();
await page.waitForFunction(() => /\/review\/\d{4}-\d{2}-\d{2}$/.test(location.hash));
await section('completed').locator('li strong', { hasText: '지난주에 한 일' }).waitFor();
await page.getByRole('link', { name: '이번 주' }).click();
await section('completed').locator('li strong', { hasText: '주간 회고 화면' }).waitFor();
pass('week picker moves between weeks');

await page.getByRole('button', { name: '회고 문서 만들기' }).click();
await page.waitForFunction(() => location.hash.startsWith('#document-'));
assert.match(await page.locator('#document-title').inputValue(), /^주간 회고 \d{4}-W\d{2}$/);
await page.goto(`${base}/#/review`);
await page.getByRole('button', { name: '회고 문서 열기' }).waitFor();
pass('회고 문서 만들기 creates the week document, then 열기');

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.goto(`${base}/#/review`);
await phone.locator('section[data-section="completed"] li').first().waitFor();
assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await phone.screenshot({ path: `${shots}/3-review-mobile.png`, fullPage: true });
pass('mobile layout without horizontal scroll');
await browser.close();
