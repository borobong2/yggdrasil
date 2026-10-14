// YG-48 browser acceptance (markdown tables). After `npm run build`:
//   NODE_ENV=test DATABASE_URL=postgres://yggdrasil:yggdrasil@127.0.0.1:54330/yggdrasil_yg48 npx tsx test/yg48-browser-server.ts
//   PLAYWRIGHT_CHANNEL=chrome node test/yg48-browser.mjs
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT ? pathToFileURL(`${process.env.PLAYWRIGHT}/index.mjs`).href : 'playwright-core');
const base = 'http://127.0.0.1:3048';
const screens = process.env.YG48_SCREENS ?? '/Users/bong/github/10x-life/tmp/yg48-screens';
mkdirSync(screens, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const assert = (condition, label) => { if (!condition) throw new Error(`FAIL ${label}`); pass(label); };
const table = '| 정답 | 계산 | 뜻 |\n|---|---|---|\n| 합격 (y = 1) | −log q | 합격에 준 확률을 봄 |\n| 불합격 (y = 0) | −log(1 − q) | 불합격에 준 확률을 봄 |';
const run = Date.now().toString(36);

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const k = page.keyboard;
const body = async (id) => (await (await page.request.get(`${base}/api/documents/${id}`)).json()).body;
const saved = () => page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨');

// 1. A document created outside the editor (same path as MCP create_document) renders a real table.
const created = await (await page.request.post(`${base}/api/documents`, { data: { title: `손실 함수 ${run}`, body: `## 교차 엔트로피\n\n${table}\n\n표 아래 문단 **굵게** \`code\`` } })).json();
await page.goto(`${base}/#document-${created.id}`);
await page.waitForSelector('[data-type="table"] table');
const cells = await page.$$eval('[data-type="table"] tbody tr', (rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent)));
assert(JSON.stringify(cells) === JSON.stringify([['합격 (y = 1)', '−log q', '합격에 준 확률을 봄'], ['불합격 (y = 0)', '−log(1 − q)', '불합격에 준 확률을 봄']]), 'owner example renders as <table> rows');
assert((await page.$$eval('[data-type="table"] th', (th) => th.map((cell) => cell.textContent).join())) === '정답,계산,뜻', 'header row renders as <th>');
await page.screenshot({ path: `${screens}/desktop-table.png`, fullPage: true });

// 2. Clicking enters raw-markdown editing with a live preview; edits save without corrupting the rest.
await page.locator('[data-type="table"] td').first().click();
const editor = page.locator('textarea[data-block="table"]');
assert(await editor.inputValue() === table, 'click opens the table markdown in a monospace textarea');
await k.press('Enter'); await k.type('| 모름 | `—` | **보류** |');
assert((await page.locator('[aria-label="표 미리보기"] tbody tr').count()) === 3, 'live preview shows the new row while editing');
await page.screenshot({ path: `${screens}/desktop-table-editing.png`, fullPage: true });
await saved();
assert(await body(created.id) === `## 교차 엔트로피\n\n${table}\n| 모름 | \`—\` | **보류** |\n\n표 아래 문단 **굵게** \`code\``, 'edited table saves as markdown, other blocks untouched');
await page.locator('h1, #document-title').first().click();
assert(await page.locator('[data-type="table"] tbody strong').innerText() === '보류', 'inline formatting renders inside cells');

// 3. Slash menu inserts a 3x3 table.
await page.locator('[data-type="p"]').last().click();
await k.press('End'); await k.press('Meta+Enter');
await k.type('/표');
assert((await page.getByRole('listbox').innerText()).includes('표'), 'slash menu lists 표');
await k.press('Enter');
await k.type('열 A');
await saved();
assert((await body(created.id)).endsWith('| 열 A열 1 | 열 2 | 열 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |'), 'slash 표 inserts a 3x3 markdown table');

// 4. Pasting a markdown table creates a table block.
await page.locator('#document-title').click();
await page.locator('[data-type="table"]').last().locator('table').click();
await k.press('ArrowDown'); // caret is at the end, so this leaves the raw table into a fresh paragraph
await page.evaluate((text) => {
  const data = new DataTransfer(); data.setData('text/plain', text);
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, `붙여넣은 표\n\nname | score\n:--- | ---:\n민수 | 90`);
await saved();
assert(await page.locator('[data-type="table"]').count() === 3, 'multi-line paste turns a markdown table into a table block');
assert((await body(created.id)).includes('붙여넣은 표\n\nname | score\n:--- | ---:\n민수 | 90'), 'pasted table is stored verbatim');
await page.locator('#document-title').click();
assert(await page.locator('[data-type="table"]').last().locator('td').last().evaluate((td) => getComputedStyle(td).textAlign) === 'right', 'alignment row applies to cells');

// 5. Reload keeps everything; mobile keeps the table scrollable inside its block.
await page.reload();
await page.waitForSelector('[data-type="table"] table');
assert(await page.locator('[data-type="table"] table').count() === 3, 'tables persist after reload');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/#document-${created.id}`);
await page.waitForSelector('[data-type="table"] table');
const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: innerWidth, box: getComputedStyle(document.querySelector('[data-table]')).overflowX }));
assert(overflow.page <= overflow.view && overflow.box === 'auto', `no page-level horizontal scroll on 390px (${JSON.stringify(overflow)})`);
await page.screenshot({ path: `${screens}/mobile-table.png`, fullPage: true });

assert(!errors.length, `no page errors ${errors.join(' | ')}`);
await browser.close();
