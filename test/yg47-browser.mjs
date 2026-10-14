// YG-47 PC width audit. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg47 npx tsx test/yg47-browser-server.ts
// then: node test/yg47-browser.mjs [screenshot-dir]   (AUDIT=1 only measures — used for the "before" shots)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3047';
const shots = process.argv[2] ?? 'tmp/yg47-screens';
const audit = Boolean(process.env.AUDIT);
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const tabs = ['today', 'calendar', 'inbox', 'documents', 'planning', 'board', 'activity', 'review', 'settings'];
const dense = ['today', 'calendar', 'planning', 'board', 'activity', 'review'];
const docId = (await (await fetch(`${base}/api/documents`)).json()).find((doc) => doc.title === '주간 계획').id;

for (const width of [390, 1024, 1280, 1440, 1920, 2560]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  for (const tab of tabs) {
    await page.goto(`${base}/#/${tab}`);
    if (tab === 'documents' && width > 767) await page.goto(`${base}/#document-${docId}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const edge = document.querySelector('#root > div > aside')?.getBoundingClientRect().right ?? 0; // sidebar (0 width on phones)
      const content = document.querySelector('main > *').getBoundingClientRect();
      const editor = document.querySelector('article [data-editor-measure], article > div:nth-child(2)'); // text measure = box minus padding
      const text = editor && { width: editor.clientWidth - parseFloat(getComputedStyle(editor).paddingLeft) - parseFloat(getComputedStyle(editor).paddingRight) };
      return { left: Math.round(content.left - edge), width: Math.round(content.width), right: Math.round(innerWidth - content.right), text: text && Math.round(text.width), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    console.log(`${String(width).padStart(4)} ${tab.padEnd(9)} content ${m.width}px  gap L${m.left} R${m.right}${m.text ? `  text ${m.text}px` : ''}`);
    assert.equal(m.overflow, false, `${tab}@${width}: no horizontal page scroll`);
    if (!audit && width >= 1280) {
      if (dense.includes(tab)) assert.ok(m.right <= Math.max(0, width - 208 - 2000) + 48, `${tab}@${width}: dense view uses the width (right gap ${m.right})`);
      if (tab === 'documents' && width >= 1440) assert.ok(m.text >= 700 && m.text <= 880, `documents@${width}: comfortable text measure (${m.text})`);
      if (tab === 'settings') assert.ok(m.left <= 32, 'settings stays left-aligned');
    }
    if ([390, 1440, 1920].includes(width)) await page.screenshot({ path: `${shots}/${tab}-${width}.png`, fullPage: true });
  }
  await page.close();
}

if (!audit) {
  // 전체 폭 toggle widens the editor and is remembered.
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  await page.goto(`${base}/#document-${docId}`);
  const measure = () => page.locator('[data-editor-measure]').evaluate((el) => el.clientWidth);
  await page.locator('[data-editor-measure]').waitFor();
  const narrow = await measure();
  await page.getByRole('button', { name: '전체 폭' }).click();
  assert.ok(await measure() > narrow + 300, '전체 폭 widens the editor');
  await page.screenshot({ path: `${shots}/documents-1920-full.png`, fullPage: true });
  await page.reload();
  await page.locator('[data-editor-measure]').waitFor();
  assert.equal(await page.getByRole('button', { name: '전체 폭' }).getAttribute('aria-pressed'), 'true', 'toggle remembered');
  await page.getByRole('button', { name: '전체 폭' }).click();
  console.log('PASS 전체 폭 toggle');
}
await browser.close();
console.log('PASS yg47 widths');
