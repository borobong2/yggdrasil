// Shell navigation only: all API traffic is fulfilled locally; no server or DB is used.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
const base = process.env.YG65_BASE ?? 'http://127.0.0.1:3065';
const shots = process.argv[2] ?? '/tmp/yg65-screens';
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const labels = { today: '오늘', board: '보드', calendar: '캘린더', inbox: '인박스', documents: '문서', planning: '기획', activity: '활동', review: '회고', settings: '설정' };
const errors = [];
try {
 const page = await browser.newPage({ viewport: { width: 320, height: 720 }, hasTouch: true });
 page.setDefaultTimeout(5000);
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/**', route => {
  const path = new URL(route.request().url()).pathname;
  let body = [];
  if (path === '/api/config') body = { supabaseUrl: '', supabaseAnonKey: '' };
  else if (path === '/api/todos/today') body = { date: '2026-10-26', overdue: [], today: [], waiting: [], week: [], late: [], timeline: { todos: [], ghosts: [] } };
  else if (path === '/api/calendar') body = { todos: [], undated: [], ghosts: [] };
  else if (path === '/api/review/week' || path === '/api/briefing/settings') return route.fulfill({ status: 503, json: { error: '테스트 응답' } });
  return route.fulfill({ json: body });
 });
 await page.goto(`${base}/#/today`);
 const nav = page.getByRole('navigation', { name: '주 메뉴 (모바일)', exact: true });
 const more = nav.getByRole('button', { name: '더보기' });
 const panel = page.locator('#mobile-more');
 await nav.waitFor();
 assert.equal(await nav.getByRole('link').count(), 3);
 for (const id of ['today', 'board', 'calendar']) {
  await nav.getByRole('link', { name: labels[id], exact: true }).tap();
  await page.getByRole('heading', { name: labels[id], exact: true, level: 1 }).waitFor();
  assert.equal(await nav.locator('[aria-current="page"]').getAttribute('href'), `#/${id}`);
 }
 for (const id of ['inbox', 'documents', 'planning', 'activity', 'review', 'settings']) {
  await more.tap();
  await panel.getByRole('link', { name: labels[id], exact: true }).tap();
  await page.getByRole('heading', { name: labels[id], exact: true, level: 1 }).waitFor();
  assert.equal(await panel.isVisible(), false);
  assert.equal(await more.getAttribute('aria-label'), `더보기, 현재 ${labels[id]}`);
  await more.tap();
  assert.equal(await panel.locator('[aria-current="page"]').getAttribute('href'), `#/${id}`);
  await panel.getByRole('link', { name: labels[id], exact: true }).tap(); // same route closes too
  assert.equal(await panel.isVisible(), false);
 }
 // Native popover keyboard order, dismissal and focus restoration.
 await more.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
 assert.equal(await panel.getByRole('link', { name: '인박스', exact: true }).evaluate(el => el === document.activeElement), true);
 await page.keyboard.press('Escape');
 assert.equal(await more.evaluate(el => el === document.activeElement), true);
 assert.equal(await panel.isVisible(), false);
 await more.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
 await page.getByRole('heading', { name: '인박스', exact: true, level: 1 }).waitFor();
 assert.equal(await panel.isVisible(), false);
 assert.equal(await more.evaluate(el => el === document.activeElement), true);
 await more.tap(); await page.locator('h1').tap(); assert.equal(await panel.isVisible(), false);
 // Deep links and back/forward keep the shell selection.
 for (const [hash, id] of [['/calendar/week/2026-10-26', 'calendar'], ['document-example', 'documents'], ['issue-example', 'planning'], ['capture-example', 'inbox']]) {
  await page.evaluate(hash => { location.hash = hash; }, hash);
  await page.getByRole('heading', { name: labels[id], exact: true, level: 1 }).waitFor();
  await more.tap();
  const current = id === 'calendar' ? nav.locator('a[aria-current="page"]') : panel.locator('a[aria-current="page"]');
  assert.equal(await current.getAttribute('href'), `#/${id}`);
  await page.keyboard.press('Escape');
 }
 await page.goBack(); await page.getByRole('heading', { name: '기획', exact: true, level: 1 }).waitFor();
 await page.goForward(); await page.getByRole('heading', { name: '인박스', exact: true, level: 1 }).waitFor();
 for (const width of [320, 390, 767]) {
  await page.setViewportSize({ width, height: 720 });
  await more.tap();
  for (const target of [...await nav.locator(':scope > a, :scope > button').all(), ...await panel.getByRole('link').all()]) {
   const box = await target.boundingBox(); assert(box.width >= 44 && box.height >= 44);
   assert(box.x >= 0 && box.x + box.width <= width);
  }
  await page.screenshot({ path: `${shots}/mobile-${width}-more.png` });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${shots}/mobile-${width}.png` });
 }
 await more.tap();
 await page.setViewportSize({ width: 1280, height: 900 });
 await panel.waitFor({ state: 'hidden' }); assert.equal(await nav.isVisible(), false);
 const desktop = page.getByRole('navigation', { name: '주 메뉴', exact: true });
 assert.equal(await desktop.getByRole('link').count(), 9);
 for (const [id, label] of Object.entries(labels)) {
  await desktop.getByRole('link', { name: label, exact: true }).click();
  await page.getByRole('heading', { name: label, exact: true, level: 1 }).waitFor();
  assert.equal(await desktop.locator('[aria-current="page"]').getAttribute('href'), `#/${id}`);
 }
 await page.screenshot({ path: `${shots}/desktop-settings.png` });
 await page.setViewportSize({ width: 390, height: 720 }); assert.equal(await panel.isVisible(), false);
 assert.deepEqual(errors, []);
 console.log('PASS YG-65: 9 destinations, deep links/history, active state, touch targets at 320/390/767, keyboard/Escape/outside click, desktop/resizing; no DB');
} finally { await browser.close(); }
