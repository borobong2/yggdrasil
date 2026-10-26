import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:3064',shots=process.argv[2]??'/tmp/yg64-screens';mkdirSync(shots,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(5000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const writes=[];page.on('request',r=>{if(r.method()==='PATCH'&&r.url().includes('/api/todos/'))writes.push(r.postDataJSON());});
const read=async id=>(await(await page.request.get(`${base}/api/issues/${id}`)).json());
const create=async body=>(await(await page.request.post(`${base}/api/todos`,{data:body})).json());
const month=async date=>{await page.goto(`${base}/#/calendar/month/${date}`);await page.reload();await page.getByLabel('표시 기준',{exact:true}).waitFor();await page.locator(`[data-day="${date}"]`).waitFor();};
const cell=date=>page.locator(`[data-day="${date}"]`).first();
const chip=(id,date)=>date?cell(date).locator(`button[data-todo-id="${id}"]`).first():page.locator(`button[data-todo-id="${id}"]`).first();
const sidebar=()=>page.getByRole('complementary',{name:'작업 예정 없음',exact:true});
const patched=id=>page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith(`/api/todos/${id}`));
async function drag(from,to,id,alignTop=false){
 await page.waitForFunction(()=>!document.body.innerText.includes('작업 예정 저장 중…'));
 await from.waitFor();await to.scrollIntoViewIfNeeded();await from.scrollIntoViewIfNeeded();
 const a=await from.boundingBox(),b=await to.boundingBox();assert(a&&b);
 const done=patched(id);
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(a.x+a.width/2+8,a.y+a.height/2,{steps:3});await page.locator('[data-drag-overlay]').waitFor();
 await page.mouse.move(b.x+b.width/2,alignTop?b.y+a.height/2:b.y+Math.min(b.height/2,24),{steps:20});await page.mouse.up();
 try{const response=await done;await page.waitForTimeout(100); /* dnd-kit removes its click suppression listener after 50ms. */ return response;}catch(e){await page.screenshot({path:`${shots}/failed-drag.png`,fullPage:true});throw e;}
}
async function undo(id){const done=patched(id);await page.getByRole('status').getByRole('button',{name:'되돌리기',exact:true}).click();return await done;}
const pass=s=>console.log('PASS '+s);
const start=new Date(Date.UTC(2035+Math.floor(Math.random()*10),Math.floor(Math.random()*12),10));
const day=n=>new Date(start.getTime()+n*86400000).toISOString().slice(0,10);
try {
 const todo=await create({title:`마감 보존 ${Date.now()}`,dueAt:day(4),targetAt:day(1)});
 await month(day(0));
 await drag(chip(todo.id,day(4)),cell(day(2)),todo.id);
 let saved=await read(todo.id);
 assert.equal(saved.dueAt,todo.dueAt,'drag must preserve the real deadline');assert.equal(saved.targetAt,todo.targetAt);assert.equal(saved.scheduledAt,`${day(1)}T15:00:00.000Z`);
 assert.deepEqual(writes.at(-1),{scheduledAt:day(2)});
 await chip(todo.id,day(2)).waitFor();
 assert((await chip(todo.id,day(2)).textContent()).includes('실제 마감'));
 // A newer explicit deadline/target edit must survive schedule undo.
 await page.request.patch(`${base}/api/todos/${todo.id}`,{data:{dueAt:day(5),targetAt:day(3)}});
 await undo(todo.id); saved=await read(todo.id);
 assert.equal(saved.scheduledAt,null);assert.equal(saved.dueAt,`${day(4)}T15:00:00.000Z`);assert.equal(saved.targetAt,`${day(2)}T15:00:00.000Z`);
 await sidebar().locator(`[data-todo-id="${todo.id}"]`).waitFor();await chip(todo.id,day(5)).waitFor();
 pass('due-only drag and schedule-only undo preserve later explicit deadline and target edits');
 // Explicit deadline display still means work-schedule drag, then reveals the planned date.
 await page.getByLabel('표시 기준',{exact:true}).selectOption('due');
 await drag(chip(todo.id,day(5)),cell(day(2)),todo.id);
 await page.waitForFunction(()=>document.querySelector('select[aria-label="표시 기준"]').value==='effective');
 await chip(todo.id,day(2)).waitFor();
 await page.reload();await chip(todo.id,day(2)).waitFor();
 pass('due-view drag reveals planned position; scheduled-first placement survives reload');
 await drag(chip(todo.id,day(2)),sidebar(),todo.id);saved=await read(todo.id);
 assert.equal(saved.scheduledAt,null);assert.equal(saved.dueAt,`${day(4)}T15:00:00.000Z`);assert.equal(saved.targetAt,`${day(2)}T15:00:00.000Z`);
 await chip(todo.id,day(5)).waitFor();await sidebar().locator(`[data-todo-id="${todo.id}"]`).waitFor();
 pass('clear schedule keeps deadline fallback plus correctly labeled unscheduled entry');
 await undo(todo.id);await chip(todo.id,day(2)).waitFor();
 // Esc/outside drops do not save.
 const beforeCancel=await read(todo.id),count=writes.length;
 await page.waitForFunction(()=>!document.body.innerText.includes('작업 예정 저장 중…'));
 await chip(todo.id,day(2)).focus();await page.keyboard.press('Space');await page.locator('[data-drag-overlay]').waitFor();
 await page.waitForTimeout(60); // KeyboardSensor attaches keydown in setTimeout after activation.
 await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);await page.keyboard.press('Escape');
 await page.locator('[data-drag-overlay]').waitFor({state:'detached'});await page.waitForTimeout(100); // sensor detach settles before the next gesture
 assert.equal(writes.length,count);assert.equal((await read(todo.id)).scheduledAt,beforeCancel.scheduledAt);
 pass('keyboard Escape cancels without any write');
 // Move then fail undo: error retains retry instead of losing the snapshot.
 await drag(chip(todo.id,day(2)),cell(day(3)),todo.id);
 await page.route(`**/api/todos/${todo.id}`,route=>route.request().method()==='PATCH'?route.fulfill({status:500,body:'{}'}):route.continue());
 await undo(todo.id);
 await page.getByRole('status').filter({hasText:'되돌리지 못했습니다'}).waitFor();
 await page.unroute(`**/api/todos/${todo.id}`);await undo(todo.id);await chip(todo.id,day(2)).waitFor();
 pass('failed undo keeps a working retry and restores only work schedule');
 await page.route(`**/api/todos/${todo.id}`,route=>route.request().method()==='PATCH'?route.fulfill({status:500,body:'{}'}):route.continue());
 await drag(chip(todo.id,day(2)),cell(day(3)),todo.id);
 await page.getByRole('status').filter({hasText:'옮기지 못했습니다'}).waitFor();await page.unroute(`**/api/todos/${todo.id}`);
 await chip(todo.id,day(2)).waitFor();assert.equal((await read(todo.id)).scheduledAt,beforeCancel.scheduledAt);
 pass('failed move reloads correct server placement');
 // Equal dates and midnight precision, then timed <-> all-day through actual grid drops.
 const timed=await create({title:`자정 동일 ${Date.now()}`,scheduledAt:`${day(7)}T00:00:12.345+09:00`,dueAt:`${day(7)}T00:00:12.345+09:00`,targetAt:`${day(7)}T00:00:12.345+09:00`});
 await month(day(7));await drag(chip(timed.id,day(7)),cell(day(8)),timed.id);saved=await read(timed.id);
 assert.equal(saved.scheduledAt,`${day(7)}T15:00:12.345Z`);assert.equal(saved.dueAt,timed.dueAt);assert.equal(saved.targetAt,timed.targetAt);
 await page.goto(`${base}/#/calendar/day/${day(8)}`);
 await drag(page.locator(`[data-day-column] button[data-todo-id="${timed.id}"]`),page.locator('[data-allday]').first(),timed.id);
 assert.equal((await read(timed.id)).scheduledAllDay,true);
 await drag(page.locator(`[data-allday] button[data-todo-id="${timed.id}"]`),page.locator(`[data-slot="${day(8)}T9"]`),timed.id,true);
 saved=await read(timed.id);assert.equal(saved.scheduledAllDay,false);assert.equal(saved.scheduledAt,`${day(8)}T00:00:00.000Z`);assert.equal(saved.dueAt,timed.dueAt);
 pass('same dates, KST midnight precision and timed/all-day conversion preserve real dates');
 // New unplanned todo is placed as a schedule, with no fabricated deadline.
 const blank=await create({title:`일반 투두 ${Date.now()}`});await month(day(10));
 await drag(sidebar().locator(`[data-todo-id="${blank.id}"]`),cell(day(10)),blank.id);saved=await read(blank.id);
 assert.equal(saved.dueAt,null);assert.equal(saved.targetAt,null);assert.equal(saved.scheduledAllDay,true);
 pass('date-free todo placement creates only a work schedule');
 // Navigation during a held save must keep the new month and use authoritative data on undo.
 await month(day(10));
 let release, reached;
 const gate=new Promise(resolve=>release=resolve), intercepted=new Promise(resolve=>reached=resolve);
 await page.route(`**/api/todos/${blank.id}`,async route=>{if(route.request().method()!=='PATCH')return route.continue();const response=await route.fetch();reached();await gate;await route.fulfill({response});});
 const pendingMove=drag(chip(blank.id,day(10)),cell(day(11)),blank.id);
 await intercepted;
 await page.getByRole('status').filter({hasText:'작업 예정 저장 중'}).waitFor();
 const nextMonthDate=new Date(start);nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth()+1);
 const nextMonth=nextMonthDate.toISOString().slice(0,7);
 await page.getByRole('button',{name:'다음',exact:true}).click();
 await page.waitForFunction(value=>document.querySelector('input[aria-label="연·월 선택"]').value===value,nextMonth);
 release();await pendingMove;await page.unroute(`**/api/todos/${blank.id}`);
 assert.equal(await page.getByLabel('연·월 선택',{exact:true}).inputValue(),nextMonth);
 assert.equal(await page.locator(`[data-todo-id="${blank.id}"]`).count(),0);
 await undo(blank.id);assert.equal(await page.getByLabel('연·월 선택',{exact:true}).inputValue(),nextMonth);
 assert.equal((await read(blank.id)).scheduledAt,`${day(9)}T15:00:00.000Z`);
 pass('navigation during pending save and later undo cannot reset the visible month or replay stale placement');
 await month(day(10));
 const noOpBefore=await read(blank.id),noOpCount=writes.length;
 for(const outside of [false,true]){
  const a=await chip(blank.id,day(10)).boundingBox(), b=await cell(day(10)).boundingBox();assert(a&&b);
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(a.x+a.width/2+8,a.y+a.height/2,{steps:3});await page.locator('[data-drag-overlay]').waitFor();
  await page.mouse.move(outside?220:b.x+b.width/2,outside?55:b.y+20,{steps:20});await page.mouse.up();await page.waitForTimeout(100);
 }
 assert.equal(writes.length,noOpCount);assert.equal((await read(blank.id)).scheduledAt,noOpBefore.scheduledAt);
 pass('same-day no-op and outside drop write nothing');
 // Today quick snooze and next-week bulk snooze share the schedule-only contract.
 const actualToday=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 const plus=(date,n)=>new Date(Date.parse(`${date}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
 const routine=await create({title:`미루기 ${Date.now()}`,priority:'p1',scheduledAt:`${actualToday}T10:30:00+09:00`,dueAt:plus(actualToday,5),targetAt:plus(actualToday,1)});
 await page.goto(`${base}/#/today`);await page.reload();
 const routineRow=page.locator(`[data-todo-id="${routine.id}"]`).first();await routineRow.hover();
 let bulkDone=page.waitForResponse(r=>r.url().endsWith('/api/todos/bulk')&&r.request().method()==='POST');
 await routineRow.getByRole('button',{name:'내일',exact:true}).click();await bulkDone;
 saved=await read(routine.id);assert.equal(saved.dueAt,routine.dueAt);assert.equal(saved.targetAt,routine.targetAt);assert.equal(saved.scheduledAt,`${plus(actualToday,1)}T01:30:00.000Z`);
 bulkDone=page.waitForResponse(r=>r.url().endsWith('/api/todos/bulk')&&r.request().method()==='POST');
 await page.getByRole('status').getByRole('button',{name:'되돌리기',exact:true}).click();await bulkDone;
 assert.equal((await read(routine.id)).scheduledAt,routine.scheduledAt);
 await page.getByRole('button',{name:'선택',exact:true}).click();await page.getByRole('checkbox',{name:`${routine.title} 선택`,exact:true}).click();
 await page.getByRole('button',{name:'미루기',exact:true}).click();
 bulkDone=page.waitForResponse(r=>r.url().endsWith('/api/todos/bulk')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'다음 주 월요일',exact:true}).click();await bulkDone;
 const weekday=new Date(`${actualToday}T00:00:00Z`).getUTCDay();const monday=plus(actualToday,((8-weekday)%7)||7);
 saved=await read(routine.id);assert.equal(saved.scheduledAt,`${monday}T01:30:00.000Z`);assert.equal(saved.dueAt,routine.dueAt);assert.equal(saved.targetAt,routine.targetAt);
 pass('today tomorrow/undo and next-week bulk snooze preserve real dates and scheduled time');
 await month(day(14));
 await cell(day(14)).getByRole('button',{name:/할 일 추가$/}).click();
 let dialog=page.getByRole('dialog');assert((await dialog.textContent()).includes('작업 예정일'));
 await dialog.getByLabel('제목',{exact:true}).fill(`예정 생성 ${Date.now()}`);
 let created=page.waitForResponse(r=>r.url().endsWith('/api/todos')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'추가',exact:true}).click();let newTodo=await(await created).json();
 assert.equal(newTodo.scheduledAt,`${day(13)}T15:00:00.000Z`);assert.equal(newTodo.dueAt,null);
 await page.getByLabel('표시 기준',{exact:true}).selectOption('due');
 await cell(day(15)).getByRole('button',{name:/할 일 추가$/}).click();dialog=page.getByRole('dialog');assert((await dialog.textContent()).includes('실제 마감일'));
 await dialog.getByLabel('제목',{exact:true}).fill(`명시 마감 생성 ${Date.now()}`);
 created=page.waitForResponse(r=>r.url().endsWith('/api/todos')&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'추가',exact:true}).click();newTodo=await(await created).json();
 assert.equal(newTodo.scheduledAt,null);assert.equal(newTodo.dueAt,`${day(14)}T15:00:00.000Z`);
 pass('default calendar creation sets schedule; explicit deadline view creation is labeled and intentional');
 for(const width of [390,768,1280]){
  await page.setViewportSize({width,height:1000});await month(day(2));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert((await page.locator('section[aria-label="캘린더"]').textContent()).includes('예정 우선'));
  await page.screenshot({path:`${shots}/${width}-scheduling.png`,fullPage:true});pass(`${width}: labels and no horizontal overflow`);
 }
 for(const write of writes)assert.deepEqual(Object.keys(write),['scheduledAt']);
 assert.deepEqual(errors,[]);
} finally {await browser.close();}
