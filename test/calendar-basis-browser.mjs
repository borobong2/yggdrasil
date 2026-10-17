import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000);
const base='http://127.0.0.1:3050';
const chip=(title,scope=page)=>scope.locator('button[data-todo-id]:visible').filter({hasText:title}).first();
const todo=async title=>(await(await fetch(`${base}/api/issues`)).json()).find(x=>x.title===title);
await page.goto(`${base}/#/calendar/day/2026-10-18`);
const timed=page.locator('[data-day-column="2026-10-18"]');await timed.waitFor();
assert.equal(await chip('자정 timed',timed).count(),1,'timed midnight belongs in time column');
assert.equal(await page.locator('ul[aria-label$="종일"]').locator('button[data-todo-id]').filter({hasText:'자정 timed'}).count(),0);
await page.getByLabel('시간표',{exact:true}).evaluate(el=>el.scrollTop=0);assert.equal(await chip('자정 timed',timed).getByText('00:00',{exact:true}).count(),1);
await page.getByLabel('표시 기준',{exact:true}).selectOption('scheduled');await chip('두 날짜').waitFor();assert.equal(await chip('자정 timed').count(),0);
// Creation and drag must use scheduledAt when scheduled is selected.
await page.locator('[data-slot="2026-10-18T9"]').click();const dialog=page.getByRole('dialog',{name:'할 일 추가'});await dialog.getByLabel('제목').fill('예정 기준 생성');await dialog.getByRole('button',{name:'추가',exact:true}).click();await chip('예정 기준 생성').waitFor();assert.equal((await todo('예정 기준 생성')).scheduledAt,'2026-10-18T00:00:00.000Z');assert.equal((await todo('예정 기준 생성')).dueAt,null);
// Keyboard date move in month view changes only the selected field, with undo.
const both=await todo('두 날짜');await page.getByRole('button',{name:'월',exact:true}).click();await page.locator('[data-day="2026-10-18"]').waitFor();
await chip('두 날짜').focus();await page.keyboard.press('Space');await page.waitForTimeout(100);await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);
const patch=page.waitForResponse(r=>r.url().includes(`/api/todos/${both.id}`)&&r.request().method()==='PATCH');await page.keyboard.press('Space');await patch;
assert.equal((await todo('두 날짜')).dueAt,both.dueAt);assert.equal((await todo('두 날짜')).scheduledAt,'2026-10-18T15:00:00.000Z');
const undo=page.waitForResponse(r=>r.url().includes(`/api/todos/${both.id}`)&&r.request().method()==='PATCH');await page.getByRole('button',{name:'되돌리기',exact:true}).click();await undo;assert.equal((await todo('두 날짜')).scheduledAt,both.scheduledAt);assert.equal((await todo('두 날짜')).scheduledAllDay,false);
await page.getByLabel('표시 기준',{exact:true}).selectOption('due');await chip('종일 원본').waitFor();assert.equal(await chip('두 날짜').count(),0);assert.equal(await chip('예정 기준 생성').count(),0);
await page.getByLabel('표시 기준',{exact:true}).selectOption('effective');await page.getByLabel('연·월 선택').fill('2026-10');await page.goto(`${base}/#/calendar/day/2026-10-26`);
await page.locator('[data-day-column="2026-10-26"]').waitFor();const day=page.locator('[data-day-column="2026-10-26"]');await day.getByLabel('자정 반복 반복 예정',{exact:true}).waitFor();assert.equal(await day.getByLabel('자정 반복 반복 예정',{exact:true}).getByText('00:00',{exact:true}).count(),1);assert.equal(await page.locator('ul[aria-label$="종일"]').getByLabel('종일 반복 반복 예정',{exact:true}).count(),1);
for(const mode of ['month','week','3day','day','list']){await page.goto(`${base}/#/calendar/${mode}/2026-10-26`);await page.locator('[data-ghost]').first().waitFor();assert.equal(await page.getByRole('group',{name:'보기',exact:true}).getByRole('button').count(),5);}
mkdirSync('tmp/calendar-acceptance',{recursive:true});await page.screenshot({path:'tmp/calendar-acceptance/yg53-basis.png'});
console.log('PASS basis: due/scheduled/default, selected creation/drag/undo, timed midnight/ghosts, all five views');await browser.close();
