import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
const stage=Number(process.env.CALENDAR_STAGE||50);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Seoul'});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='http://127.0.0.1:3050';
const api=async()=> (await (await fetch(`${base}/api/issues`)).json());
const todo=async title=>(await api()).find(x=>x.title===title);
const chip=(title,scope=page)=>scope.locator('button[data-todo-id]:visible').filter({hasText:title}).first();
const waitPatch=()=>page.waitForResponse(r=>r.url().includes('/api/todos/')&&r.request().method()==='PATCH');
async function drag(from,to){
 await from.scrollIntoViewIfNeeded();const a=await from.boundingBox();await to.scrollIntoViewIfNeeded();const b=await to.boundingBox();
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2+10,a.y+a.height/2+10,{steps:3});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});
 const saved=waitPatch();await page.mouse.up();assert.equal((await saved).status(),200);await page.waitForTimeout(100);
}
async function undo(){const saved=waitPatch();await page.getByRole('button',{name:'되돌리기',exact:true}).click();assert.equal((await saved).status(),200);await page.waitForTimeout(100);}
await page.goto(`${base}/#/calendar/month/2026-10-18`);await chip('종일 원본').waitFor();
await page.locator('[data-day="2026-10-22"]').getByRole('button',{name:/할 일 추가/}).click();
const dialog=page.getByRole('dialog',{name:'할 일 추가'});await dialog.waitFor();
await dialog.getByLabel('제목').fill('클릭 종일');await dialog.getByRole('button',{name:'추가',exact:true}).click();await chip('클릭 종일').waitFor();
assert.equal((await todo('클릭 종일')).dueAllDay,true);
await drag(chip('종일 원본'),page.locator('[data-day="2026-10-23"]'));
if(stage>=52){await page.getByRole('button',{name:'일',exact:true}).click();await page.locator('[data-slot]').first().waitFor();await undo();await chip('종일 원본').waitFor();await page.getByRole('button',{name:'월',exact:true}).click();await page.locator('[data-day]').first().waitFor();}else await undo();assert.equal((await todo('종일 원본')).dueAllDay,true);
await drag(chip('예정 종일'),page.getByRole('complementary',{name:'날짜 없음'}));assert.equal((await todo('예정 종일')).scheduledAt,null);await undo();assert.equal((await todo('예정 종일')).scheduledAllDay,true);
await drag(chip('둘 복원'),page.getByRole('complementary',{name:'날짜 없음'}));await undo();assert.equal((await todo('둘 복원')).dueAllDay,true);assert.equal((await todo('둘 복원')).scheduledAllDay,false);
await page.getByRole('button',{name:'일',exact:true}).click();await page.locator('[data-slot]').first().waitFor();
await page.locator('[data-slot="2026-10-18T10"]').click();await dialog.getByLabel('제목').fill('클릭 시간');await dialog.getByRole('button',{name:'추가',exact:true}).click();await chip('클릭 시간').waitFor();assert.equal((await todo('클릭 시간')).dueAt,'2026-10-18T01:00:00.000Z');assert.equal((await todo('클릭 시간')).dueAllDay,false);
// Same instant changes all-day semantics, and undo restores them.
await page.getByLabel('시간표',{exact:true}).evaluate(el=>el.scrollTop=0);
await drag(chip('종일 원본'),page.locator('[data-slot="2026-10-18T0"]'));assert.equal((await todo('종일 원본')).dueAllDay,false);await undo();assert.equal((await todo('종일 원본')).dueAllDay,true);
await page.locator('[data-slot="2026-10-18T8"]').click();await dialog.getByLabel('제목').fill('취소할 입력');await dialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await todo('취소할 입력'),undefined);
if(stage>=51){
 await page.getByRole('button',{name:'월',exact:true}).click();
 await page.locator('[data-day="2026-10-22"]').waitFor();
 const heads=page.locator('section[aria-label="캘린더"] .grid.grid-cols-7').first();assert.deepEqual(await heads.locator('span').allTextContents(),['일','월','화','수','목','금','토']);
 await page.locator('[data-day="2026-10-22"]').getByRole('button',{name:/하루 보기/}).click();await page.waitForURL('**/#/calendar/day/2026-10-22');await chip('클릭 종일').waitFor();
}
// A failed save preserves input; retry creates once. Card click opens detail, not creation.
await chip('클릭 종일').click();await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('dialog',{name:'할 일 추가'}).count(),0);await page.getByRole('button',{name:'상세 닫기',exact:true}).click();
await page.getByRole('button',{name:'월',exact:true}).click();await page.locator('[data-day="2026-10-24"]').waitFor();
await page.locator('[data-day="2026-10-24"]').getByRole('button',{name:/할 일 추가/}).click();await dialog.getByLabel('제목').fill('오류 재시도');
await page.route('**/api/todos',route=>route.fulfill({status:500,contentType:'application/json',body:'{"error":"fixture failure"}'}),{times:1});
await dialog.getByRole('button',{name:'추가',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('제목').inputValue(),'오류 재시도');await dialog.getByRole('button',{name:'추가',exact:true}).click();await chip('오류 재시도').waitFor();
mkdirSync('tmp/calendar-acceptance',{recursive:true});await page.screenshot({path:`tmp/calendar-acceptance/yg${stage}-desktop.png`});
const phone=await context.newPage();await phone.setViewportSize({width:390,height:844});await phone.goto(`${base}/#/calendar/month/2026-10-18`);await phone.locator('[data-day="2026-10-22"]').getByRole('button',{name:/할 일 추가/}).click();await phone.getByRole('dialog',{name:'할 일 추가'}).waitFor();await phone.screenshot({path:`tmp/calendar-acceptance/yg${stage}-mobile.png`});await phone.getByRole('button',{name:'취소',exact:true}).click();
assert.deepEqual(errors,[]);console.log(`PASS YG-${stage} browser acceptance: create/date semantics/undo/null/desktop/mobile`);await browser.close();
