// Start Vite locally, then run CHROME_PATH=/path/to/chrome node test/yg82-browser.mjs.
// All API responses are intercepted; no server or database writes are made.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.YG82_BASE || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const todo = {
  id: 't', title: '긴제목'.repeat(60), createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  epicId: 'e', status: 'todo', position: 0, priority: 'p1', dueAt: null, dueAllDay: false,
  scheduledAt: '2026-10-28T01:00:00Z', scheduledAllDay: false, targetAt: null, targetAllDay: false,
  hold: 'waiting', holdReason: '긴사유'.repeat(20), notes: '', estimateMinutes: null, actualMinutes: null,
  source: null, key: 'YG-123456789', completedAt: null, archivedAt: null, links: [], area: '긴메타'.repeat(20), epic: 'App', recurrence: null
};
const view = { date: '2026-10-28', today: [todo], overdue: [], waiting: [{ ...todo, id: 'waiting' }], week: [], late: [{ ...todo, id: 'late', lateDays: 5, untouchedDays: 65, age: 5, bucket: 'month' }], timeline: { todos: [todo], ghosts: [] } };
for (const [width, height] of [[719, 800], [720, 800], [767, 800], [768, 800], [1099, 800], [1100, 800], [1119, 800], [1199, 800], [1200, 800], [1280, 800], [1366, 768], [1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().endsWith('/api/config') ? {} : view }));
  await page.goto(base);
  await page.locator('[data-section="timeline"]').waitFor();
  const geometry = await page.evaluate(() => {
    const timeline = document.querySelector('[data-section="timeline"]');
    const grid = timeline.parentElement.parentElement.getBoundingClientRect();
    const late = document.querySelector('[data-section="late"]').getBoundingClientRect();
    return { gridRight: grid.right, lateRight: late.right, scrollWidth: document.documentElement.scrollWidth, width: innerWidth };
  });
  assert.ok(geometry.lateRight <= geometry.gridRight + 1, `late panel exceeds grid at ${width}`);
  assert.ok(geometry.scrollWidth <= geometry.width, `document overflows at ${width}`);
  if (width < 720) {
    await page.getByRole('tab', { name: /오늘/ }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: /밀린 일/ }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: /밀린 일/ }).click();
    assert.equal(await page.locator('[data-section=late]').isVisible(), true);
    await page.getByRole('tab', { name: /오늘/ }).click();
  } else if (width >= 768) {
    await page.locator('[data-section=today] li').hover();
    assert.equal(await page.getByRole('button', { name: '내일', exact: true }).isVisible(), true);
    if (width === 768) {
      const row = page.locator('[data-section=today] li').first();
      const title = row.locator('> button:not([role])');
      assert.ok((await title.boundingBox()).width >= 100, 'hover actions must not squeeze the title out');
      const panel = await page.locator('[data-section=today]').boundingBox();
      for (const name of ['내일', '완료']) {
        const action = await row.getByRole('button', { name, exact: true }).boundingBox();
        assert.ok(action.x >= panel.x && action.x + action.width <= panel.x + panel.width, `${name} must remain inside panel`);
      }
    }
  }
  if (width >= 720) {
    const timeline = await page.locator('[data-section=timeline]').boundingBox();
    const today = await page.locator('[data-section=today]').boundingBox();
    assert.equal(timeline.y < today.y, width < 1200, `panel order at ${width}`);
  }
  await page.locator('[data-section=timeline] p').last().scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-section=timeline] p').last().isVisible(), true);
  console.log(`PASS ${width}x${height}`, geometry);
  await page.close();
}
// Touch-capable laptop: no dependence on hover to open a long-title row.
const touch = await browser.newPage({ viewport: { width: 1100, height: 800 }, hasTouch: true, isMobile: true });
await touch.route('**/api/**', route => route.fulfill({ json: route.request().url().endsWith('/api/config') ? {} : view }));
await touch.goto(base);
await touch.locator('[data-section=today] li').first().waitFor();
assert.equal(await touch.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
await touch.getByRole('button', { name: '선택', exact: true }).tap();
assert.equal(await touch.getByRole('button', { name: '선택 끝내기' }).isVisible(), true);
await touch.close();

// Keep a successful add visible while the following refresh fails; all writes are fixture responses.
const state = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let loads = 0;
await state.route('**/api/**', route => {
  const request = route.request();
  if (request.url().endsWith('/api/config')) return route.fulfill({ json: {} });
  if (request.url().endsWith('/api/todos/today')) return route.fulfill(++loads === 1 ? { json: view } : { status: 500, json: {} });
  return route.fulfill({ json: { ...todo, id: 'new', title: '새로 추가한 긴 제목'.repeat(20) } });
});
await state.goto(base);
await state.getByLabel('새 할 일 제목').fill('fixture');
await state.getByLabel('할 일 추가').click();
await state.getByText(/추가됨/).waitFor();
await state.getByRole('alert').waitFor();
await state.locator('[data-section=timeline] p').last().scrollIntoViewIfNeeded();
assert.equal(await state.locator('[data-section=timeline] p').last().isVisible(), true);
assert.ok(await state.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await state.close();
await browser.close();
