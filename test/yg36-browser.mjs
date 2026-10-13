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
// YG-34: 방치 (YG-41) is merged into the 밀린 일 rail together with 마감 지남 — once each, aged, backlog left out.
const late = page.locator('section[data-section="late"]');
const lateRows = async () => Object.fromEntries((await late.locator('li[data-todo-id] button').evaluateAll((buttons) => buttons.map((button) => [button.children[0].textContent, button.children[1].textContent]))));

await page.goto(base);
await late.waitFor();
assert.deepEqual(await lateRows(), { '어제 마감': '1일', '보험 서류 정리': '15일', '운동화 수선': '23일', '포트폴리오 개편': '40일 그대로' });
assert.match(await late.locator('[data-bucket="older"]').textContent(), /한 달 넘음1/);
assert.equal(await page.getByText('방치된 할 일').count(), 0);
await page.screenshot({ path: `${shots}/1-today-late-merged.png`, fullPage: true });
pass('stale todos sit in 밀린 일 with their age (마감 N일 / N일 그대로); backlog is left out; no separate 방치 section');

await late.getByRole('button', { name: '하나씩 정리' }).click();
const triage = page.getByRole('dialog', { name: '밀린 일 정리' });
assert.match(await triage.textContent(), /밀린 일 1 \/ 4 · 40일 동안 그대로 · 커리어.*포트폴리오 개편/);
const bulked = page.waitForResponse((response) => response.url().endsWith('/api/todos/bulk'));
await page.keyboard.press('b');
await bulked;
await page.keyboard.press('Escape');
await triage.waitFor({ state: 'detached' });
await page.waitForFunction(() => /밀린 일3/.test(document.querySelector('section[data-section="late"] h2')?.textContent ?? ''));
assert.ok(!('포트폴리오 개편' in await lateRows()));
pass('정리 모드 starts with the oldest (stale) one; B moves it to 백로그');

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
await phone.getByRole('tab', { name: /밀린 일/ }).click();
await phone.locator('section[data-section="late"]').waitFor();
await phone.screenshot({ path: `${shots}/7-mobile-late.png`, fullPage: true });
pass('mobile layout');
await browser.close();
