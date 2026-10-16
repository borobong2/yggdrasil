import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(5000);
const base='http://127.0.0.1:3050';
const pending=[];
await page.route('**/api/calendar?*',async route=>{const url=new URL(route.request().url());pending.push({route,from:url.searchParams.get('from'),to:url.searchParams.get('to')});});
async function next(){await page.waitForFunction(()=>true);for(let i=0;i<100&&!pending.length;i++)await new Promise(r=>setTimeout(r,10));assert.ok(pending.length,'calendar request issued');return pending.shift();}
async function fulfill(req,title,status=200){await req.route.fulfill({status,contentType:'application/json',body:JSON.stringify(status===200?{from:req.from,to:req.to,todos:[],undated:[{id:crypto.randomUUID(),title,priority:'p3',status:'todo',area:'개인',epic:'일반',dueAt:null,scheduledAt:null,recurrence:null,links:[]}],ghosts:[]}:{error:'failed'})});}
await page.goto(`${base}/#/calendar/month/2026-10-18`);const initial=await next();await fulfill(initial,'기존 10월');await page.getByText('기존 10월',{exact:true}).waitFor();
await page.getByRole('button',{name:'다음',exact:true}).click();const november=await next();
assert.equal(await page.getByText('기존 10월',{exact:true}).count(),0,'new month must not show old content while loading');
await page.getByRole('button',{name:'다음',exact:true}).click();const december=await next();await fulfill(december,'최신 12월');await page.getByText('최신 12월',{exact:true}).waitFor();await fulfill(november,'오래된 11월');await page.waitForTimeout(100);assert.equal(await page.getByText('오래된 11월',{exact:true}).count(),0);assert.equal(await page.getByText('최신 12월',{exact:true}).count(),1);
// Latest error must stay visible when an older success arrives.
await page.getByRole('button',{name:'다음',exact:true}).click();const january=await next();await page.getByRole('button',{name:'다음',exact:true}).click();const february=await next();await fulfill(february,'',500);await page.getByRole('alert').waitFor();await fulfill(january,'오래된 성공');assert.equal(await page.getByText('오래된 성공',{exact:true}).count(),0);assert.equal(await page.getByRole('alert').count(),1);
await page.getByRole('button',{name:'다시 시도',exact:true}).click();const retry=await next();await fulfill(retry,'재시도 성공');await page.getByText('재시도 성공',{exact:true}).waitFor();
await page.getByLabel('연·월 선택').fill('2028-02');const leap=await next();await fulfill(leap,'윤년');await page.waitForURL('**/#/calendar/month/2028-02-01');await page.getByText('윤년',{exact:true}).waitFor();
// Older failure must not remove the newer success.
await page.getByRole('button',{name:'다음',exact:true}).click();const march=await next();await page.getByRole('button',{name:'다음',exact:true}).click();const april=await next();await fulfill(april,'최신 성공');await page.getByText('최신 성공',{exact:true}).waitFor();await fulfill(march,'',500);await page.waitForTimeout(100);assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByText('최신 성공',{exact:true}).count(),1);
// Done toggle is a new query, even at the same range.
await page.getByLabel('완료 표시',{exact:true}).check();const done=await next();assert.equal(await page.getByText('최신 성공',{exact:true}).count(),0);await fulfill(done,'완료 포함');await page.getByText('완료 포함',{exact:true}).waitFor();
console.log('PASS navigation: stale success/error, loading range, month picker/leap/year, done query');await browser.close();
