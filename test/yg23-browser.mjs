// YG-23 browser acceptance. Run against the fixture server after `npm run build`:
//   NODE_ENV=test DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg23 npx tsx test/yg23-browser-server.ts
//   PLAYWRIGHT=<path to an installed playwright package> node test/yg23-browser.mjs
// Playwright is loaded from outside the repo, so no browser dependency is added to the app.
// Expects at least one issue titled '자동 저장 확인' for the fixture owner (see the fixture server).
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(`${process.env.PLAYWRIGHT}/index.mjs`).href : 'playwright');
const base = 'http://127.0.0.1:3023';
const screens = process.env.YG23_SCREENS ?? '/Users/bong/github/10x-life/tmp/yg23-screens';
mkdirSync(screens, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const assert = (condition, label) => { if (!condition) throw new Error(`FAIL ${label}`); pass(label); };

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const k = page.keyboard;
const docs = async (query = '') => (await page.request.get(`${base}/api/documents${query}`)).json();
const doc = async (title) => (await docs()).find((d) => d.title === title);
const saved = () => page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨');
const newTitle = () => page.waitForFunction(() => document.querySelector('#document-title')?.value === '제목 없음');
const run = Date.now().toString(36);
const rootTitle = `설계 노트 ${run}`;

await page.goto(`${base}/#/documents`);
await page.getByRole('button', { name: '새 페이지' }).click();
await newTitle(); pass('new page opens with an inline title');
await page.fill('#document-title', rootTitle);
await k.press('Enter');
assert(await page.evaluate(() => document.activeElement?.dataset.block === 'p' && document.activeElement.placeholder.includes("'/'")), 'Enter in the title focuses the first block with the empty-page hint');

await k.type('/제목1');
assert((await page.getByRole('listbox').innerText()).includes('제목 1'), 'slash menu filters block commands');
await k.press('Enter'); await k.type('개요'); await k.press('Enter');
await k.type('/체크'); await k.press('Enter'); await k.type('체크 항목'); await k.press('Enter'); await k.press('Enter');
await k.type('- 글머리'); await k.press('Enter'); await k.press('Enter');
await k.type('/콜아웃'); await k.press('Enter'); await k.type('콜아웃 내용'); await k.press('Meta+Enter');
await k.type('/토글'); await k.press('Enter'); await k.type('토글 제목'); await k.press('Meta+Enter');
await k.type('/구분'); await k.press('Enter');
await k.type('할 일 @자동');
assert((await page.getByRole('listbox', { name: '할 일 언급' }).innerText()).includes('자동 저장 확인'), '@ opens the issue mention picker');
await k.press('Enter');
await k.press('Meta+Enter'); await k.type('```'); await k.type('const a = 1;');
await saved(); pass('debounced autosave reports 저장됨');

await page.reload();
await page.waitForSelector('[data-row]');
const types = await page.$$eval('[data-row]', (rows) => rows.map((row) => row.dataset.type).join(','));
assert(types === 'h1,todo,bullet,callout,toggle,divider,p,code', `slash/markdown blocks persist after reload (${types})`);
assert(await page.locator('[data-mention]').innerText() === '@자동 저장 확인', 'mention renders as a chip');
assert((await page.getByRole('region', { name: '연결된 할 일' }).innerText()).includes('자동 저장 확인'), 'linked todo listed at the page bottom');
const root = await doc(rootTitle);
assert(root.body.includes('> [!NOTE]\n> 콜아웃 내용') && root.body.includes('- [ ] 체크 항목') && root.body.includes('```\nconst a = 1;\n```'), 'body is stored as markdown');
await page.getByRole('button', { name: '페이지 아이콘 선택' }).click();
await page.getByRole('button', { name: '아이콘 🧭' }).click();
await saved();
assert((await doc(rootTitle)).icon === '🧭', 'emoji icon saved');
await page.screenshot({ path: `${screens}/desktop-editor.png` });

await page.getByRole('button', { name: `${rootTitle} 하위 페이지 추가` }).click();
await newTitle();
await page.fill('#document-title', `하위 ${run}`);
await saved();
const child = await doc(`하위 ${run}`);
assert(child.parentId === root.id, 'sub-page is created under its parent');

const mover = await (await page.request.post(`${base}/api/documents`, { data: { title: `옮길 페이지 ${run}`, icon: '📦' } })).json();
await page.reload();
await page.locator(`[data-doc="${mover.id}"]`).dragTo(page.locator(`[data-doc="${child.id}"]`));
await page.locator(`li:has(> [data-doc="${child.id}"]) [data-doc="${mover.id}"]`).waitFor();
assert((await doc(`옮길 페이지 ${run}`)).parentId === child.id, 'drag onto a page reparents it');
await page.locator(`[data-doc="${root.id}"]`).dragTo(page.locator(`[data-doc="${mover.id}"]`));
await page.waitForTimeout(500);
assert((await doc(rootTitle)).parentId === null, 'dropping a page into its own descendant is ignored');

await page.getByRole('button', { name: `옮길 페이지 ${run} 휴지통으로 이동` }).click();
await page.locator(`[data-doc="${mover.id}"]`).waitFor({ state: 'detached' });
assert(!(await docs()).some((d) => d.id === mover.id) && (await docs('?archived=true')).some((d) => d.id === mover.id), 'trash archives the page');
await page.getByRole('button', { name: '휴지통', exact: true }).click();
await page.getByRole('button', { name: `옮길 페이지 ${run} 복원` }).click();
await page.locator(`[data-doc="${mover.id}"]`).waitFor();
pass('restore brings it back');
await page.locator(`[data-doc="${root.id}"] button`).nth(1).click();
await page.waitForSelector('[data-row]');
await page.screenshot({ path: `${screens}/desktop-tree.png` });
await page.locator('[data-row][data-type="p"]').first().click();
await k.press('End'); await k.press('Enter'); await k.type('/');
await page.screenshot({ path: `${screens}/desktop-slash-menu.png` });
await k.press('Escape'); await k.press('Backspace'); await k.press('Backspace');

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#/documents`);
await page.locator(`[data-doc="${root.id}"]`).waitFor();
assert(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile tree has no horizontal scroll');
await page.screenshot({ path: `${screens}/mobile-tree.png` });
await page.locator(`[data-doc="${root.id}"] button`).nth(1).click();
await page.waitForSelector('[data-row]');
assert(await page.evaluate(() => getComputedStyle(document.querySelector('[aria-label="페이지 목록"]')).display === 'none' && document.documentElement.scrollWidth <= 390), 'mobile shows the editor full width');
await page.screenshot({ path: `${screens}/mobile-editor.png` });
await page.locator('[data-row][data-type="p"]').first().click();
await k.press('End'); await k.press('Enter'); await k.type('/');
assert(await page.evaluate(() => { const r = document.querySelector('[role=listbox]').getBoundingClientRect(); return r.left >= 0 && r.right <= 390; }), 'mobile slash menu fits the viewport');
await page.screenshot({ path: `${screens}/mobile-slash-menu.png` });
await k.press('Escape'); await k.press('Backspace'); await k.press('Backspace');
await page.getByRole('button', { name: '페이지', exact: true }).click();
await page.locator(`[data-doc="${root.id}"]`).waitFor();
pass('mobile back button returns to the tree');
assert(!errors.length, `no page errors ${errors.join('; ')}`);
await browser.close();
console.log('YG-23 browser acceptance passed');
