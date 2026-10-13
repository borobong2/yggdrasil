// YG-36 티켓 키 + YG-41 방치 감지 acceptance. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg36 npx tsx test/yg36-browser-server.ts
// then: node test/yg36-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3036';
const shots = process.argv[2] ?? 'tmp/yg36-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const stale = page.locator('section[data-section="stale"]');
const staleTitles = async () => (await stale.locator('li[data-todo-id] strong').allTextContents()).map((text) => text.replace(/^YG-\d+/, ''));

await page.goto(base);
await page.locator('section[data-section="today"]').waitFor();
const toggle = stale.getByRole('button', { name: /방치된 할 일/ });
assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
assert.match(await toggle.textContent(), /방치된 할 일 3건/);
assert.equal(await stale.locator('li').count(), 0);
await page.screenshot({ path: `${shots}/1-today-stale-collapsed.png`, fullPage: true });
pass('오늘 shows a collapsed 방치된 할 일 3건 section');

await toggle.click();
assert.deepEqual((await staleTitles()).sort(), ['보험 서류 정리', '운동화 수선', '포트폴리오 개편']);
const chips = async (title) => (await stale.locator('li', { hasText: title }).locator('.bg-warn-soft').allTextContents());
assert.deepEqual(await chips('운동화 수선'), ['마감 23일 지남', '47일 동안 그대로']);
assert.deepEqual(await chips('보험 서류 정리'), ['마감 15일 지남']);
assert.deepEqual(await chips('포트폴리오 개편'), ['40일 동안 그대로']);
await page.waitForTimeout(250); // chevron transition
await page.screenshot({ path: `${shots}/2-today-stale-expanded.png`, fullPage: true });
pass('expanded section lists stale todos with reason chips; backlog is left out');

for (const title of ['운동화 수선', '포트폴리오 개편']) await stale.getByRole('checkbox', { name: `${title} 선택` }).click();
await page.getByRole('toolbar', { name: '일괄 작업' }).waitFor();
await page.screenshot({ path: `${shots}/3-stale-bulk-selected.png`, fullPage: true });
const bulked = page.waitForResponse((response) => response.url().endsWith('/api/todos/bulk'));
await page.getByRole('toolbar', { name: '일괄 작업' }).getByRole('button', { name: '백로그로' }).click();
await bulked;
await page.waitForFunction(() => /방치된 할 일 1건/.test(document.querySelector('section[data-section="stale"]')?.textContent ?? ''));
assert.deepEqual(await staleTitles(), ['보험 서류 정리']);
pass('YG-26 bulk 백로그로 works from the stale section');

await page.locator('section[data-section="today"]').getByRole('button', { name: /보고서 제출/ }).click();
const dialog = page.getByRole('dialog', { name: '보고서 제출' });
await dialog.getByRole('button', { name: '티켓으로 승격' }).click();
await dialog.getByRole('alert').filter({ hasText: '기본 접두사가 없습니다' }).waitFor();
await dialog.getByLabel('티켓 키').fill('car');
await dialog.getByRole('button', { name: '티켓으로 승격' }).click();
await page.waitForFunction(() => document.querySelector('dialog .eyebrow')?.textContent?.startsWith('CAR-1'));
assert.equal(await dialog.getByRole('button', { name: '티켓으로 승격' }).count(), 0);
await page.screenshot({ path: `${shots}/4-promoted.png` });
await dialog.getByRole('button', { name: '상세 닫기' }).click();
pass('티켓으로 승격 asks for a prefix when the epic has none, then shows CAR-1 and hides the button');

await page.goto(`${base}/#/settings`);
const settings = page.locator('section[aria-label="티켓 접두사"]');
await settings.locator('li', { hasText: '프로젝트 › yggdrasil' }).waitFor();
assert.match(await settings.locator('li').first().textContent(), /YG.*다음 YG-37/);
await settings.getByLabel('에픽').selectOption({ label: '커리어 › 일반' });
await settings.getByLabel('접두사').fill('car');
await settings.getByLabel('시작 번호').fill('100');
await settings.getByRole('button', { name: '저장' }).click();
await settings.getByRole('status').filter({ hasText: '다음 키 CAR-100' }).waitFor();
await settings.getByRole('button', { name: '수정' }).nth(0).waitFor();
await page.screenshot({ path: `${shots}/5-settings-prefixes.png`, fullPage: true });
// Lower start never moves the counter back.
await settings.getByLabel('에픽').selectOption({ label: '커리어 › 일반' });
await settings.getByLabel('시작 번호').fill('5');
await settings.getByRole('button', { name: '저장' }).click();
await settings.getByRole('status').filter({ hasText: '다음 키 CAR-100' }).waitFor();
pass('settings sets an epic prefix + start; a lower start keeps the counter');

await page.goto(`${base}/#/planning`);
await page.getByLabel('유형').selectOption('issue');
await page.getByLabel('상위 항목').selectOption({ label: 'yggdrasil' });
assert.equal(await page.getByLabel('티켓 키').isChecked(), true);
assert.equal(await page.getByLabel('키 접두어').inputValue(), 'YG');
await page.getByLabel('제목').fill('플래닝에서 만든 티켓');
const created = page.waitForResponse((response) => response.url().endsWith('/api/issues') && response.request().method() === 'POST');
await page.getByRole('button', { name: '만들기' }).click();
assert.equal((await (await created).json()).key, 'YG-37');
await page.screenshot({ path: `${shots}/6-planning-create.png`, fullPage: true });
pass('planning create form defaults 티켓 키 from the epic');

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.goto(base);
await phone.locator('section[data-section="stale"] button[aria-expanded]').click();
await phone.waitForTimeout(250);
await phone.screenshot({ path: `${shots}/7-mobile-stale.png`, fullPage: true });
pass('mobile layout');
await browser.close();
