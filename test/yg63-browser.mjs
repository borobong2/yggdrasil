import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:3063';
const screens = process.argv[2] ?? '/tmp/yg63-screens';
mkdirSync(screens, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const read = async (page, id) => (await (await page.request.get(`${base}/api/issues/${id}`)).json());
const create = async (page, body) => (await (await page.request.post(`${base}/api/todos`, { data: body })).json());
const check = (label) => console.log(`PASS ${label}`);
try {
 for (const width of [390, 768, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => errors.push(e.message));
  const run = `${width}-${Date.now()}`;
  await page.goto(`${base}/#/today`);
  const input = page.getByRole('textbox', { name: '새 할 일 제목', exact: true });
  await input.fill(`제목만 ${run}`);
  await page.getByRole('button', { name: '할 일 추가', exact: true }).click();
  await page.getByRole('button', { name: '날짜/상세 설정', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByLabel('제목', { exact: true });
  assert.equal(await title.inputValue(), `제목만 ${run}`);
  for (const label of ['시작/예정일', '내부 완료 목표일', '마감일']) assert.equal(await dialog.getByLabel(label, { exact: true }).inputValue(), '');
  for (const label of ['시작/예정일', '내부 완료 목표일', '마감일']) await dialog.getByLabel(label, { exact: true }).fill('2026-10-27');
  for (const label of ['시작/예정 시각', '내부 완료 목표 시각', '마감 시각']) await dialog.getByLabel(label, { exact: true }).fill('09:30');
  const saved = page.waitForResponse(r => r.url().includes('/api/todos/') && r.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  const todo = await (await saved).json();
  assert.equal(todo.dueAt, '2026-10-27T00:30:00.000Z');
  assert.equal(todo.targetAt, todo.dueAt); assert.equal(todo.scheduledAt, todo.dueAt);
  assert.equal(todo.targetAllDay, false);
  await page.getByRole('button', { name: '날짜/상세 설정', exact: true }).click();
  await dialog.getByLabel('제목', { exact: true }).fill(`제목만 수정 ${run}`);
  await dialog.getByRole('button', { name: '저장', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await read(page, todo.id)).scheduledAt, todo.scheduledAt);
  for (const field of [{label:'내부 완료 목표일',key:'targetAt'}, {label:'시작/예정일',key:'scheduledAt'}, {label:'마감일',key:'dueAt'}]) {
   await page.getByRole('button', { name: '날짜/상세 설정', exact: true }).click();
   const before = await read(page, todo.id);
   await dialog.getByLabel(field.label, { exact: true }).fill('');
   await dialog.getByRole('button', { name: '저장', exact: true }).click();
   await dialog.waitFor({ state: 'hidden' });
   const after = await read(page, todo.id); assert.equal(after[field.key],null);
   for (const key of ['scheduledAt','targetAt','dueAt'].filter(k=>k!==field.key)) assert.equal(after[key],before[key]);
  }
  check(`${width}: date-free quick add; same instant; title-only save; independent clearing`);
  // A failed create preserves user input; a failed detail save preserves the draft for retry.
  await input.fill(`재시도 ${run}`);
  await page.route('**/api/todos', route => route.request().method()==='POST' ? route.fulfill({status:500,body:'{}'}) : route.continue());
  await page.getByRole('button', { name:'할 일 추가',exact:true }).click();
  await page.getByRole('alert').filter({hasText:'추가하지 못했습니다'}).waitFor();
  assert.equal(await input.inputValue(),`재시도 ${run}`);
  await page.unroute('**/api/todos'); await input.fill('');
  await page.getByRole('button', { name:'날짜/상세 설정',exact:true }).click();
  await title.fill(`저장 재시도 ${run}`);
  await page.route(`**/api/todos/${todo.id}`, route => route.request().method()==='PATCH' ? route.fulfill({status:500,body:'{}'}) : route.continue());
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await dialog.getByRole('alert').waitFor(); assert.equal(await title.inputValue(),`저장 재시도 ${run}`);
  await page.unroute(`**/api/todos/${todo.id}`);
  await dialog.getByRole('button',{name:'저장',exact:true}).click(); await dialog.waitFor({state:'hidden'});
  check(`${width}: failed creation/save retains drafts for retry`);
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
  const rowTodo = await create(page,{title:`준비 표시 ${run}`, scheduledAt:today,targetAt:today,dueAt:'2026-12-31'});
  await page.reload();
  const row = page.locator(`[data-todo-id="${rowTodo.id}"]`).first();
  for(const role of ['시작/예정','내부 완료 목표','실제 마감']) assert((await row.textContent()).includes(role));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  await page.screenshot({path:`${screens}/${width}-dates.png`,fullPage:true});
  check(`${width}: three date roles visible with no horizontal overflow`);
  await page.close();
 }
 assert.deepEqual(errors,[]);
} finally { await browser.close(); }
