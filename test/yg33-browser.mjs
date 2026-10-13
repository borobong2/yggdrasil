// YG-33/42 chips acceptance. Start the fixture first (fresh seeded owner per start):
//   npm run build && NODE_ENV=test DATABASE_URL=…/yggdrasil_yg33 npx tsx test/yg33-browser-server.ts
// then: node test/yg33-browser.mjs [screenshot-dir]   (CHROME_PATH overrides the Chromium binary)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = 'http://127.0.0.1:3033';
const shots = process.argv[2] ?? 'tmp/yg33-screens';
mkdirSync(shots, { recursive: true });
const pass = (label) => console.log(`PASS ${label}`);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  await page.goto(`${base}/#/board`);
  const card = page.locator('li[data-issue-id]', { hasText: '문서 MCP 붙이기' });
  await card.waitFor();
  const chips = card.locator('a.badge, button.badge, span.badge');
  assert.deepEqual((await chips.allTextContents()).map((text) => text.trim()), ['P1', 'YG-1', '설계 문서', 'PR #52', '로컬 노트', '+2']);
  assert.equal(await card.getByRole('link', { name: 'PR #52' }).getAttribute('target'), '_blank');
  assert.equal(await page.locator('li[data-issue-id]', { hasText: '링크 없는 할 일' }).locator('.badge:has-text("+")').count(), 0);
  await page.screenshot({ path: `${shots}/${name}-board.png`, fullPage: name === 'desktop' });
  pass(`${name}: board card shows key + 3 link chips + '+2'`);

  await card.getByRole('button', { name: /이동 가능한 카드|문서 MCP 붙이기/ }).first().click();
  const dialog = page.getByRole('dialog', { name: '문서 MCP 붙이기' });
  await dialog.waitFor();
  await dialog.getByText('연결 문서').waitFor();
  assert.equal(await dialog.getByRole('link', { name: 'MCP 스펙' }).getAttribute('href'), 'https://modelcontextprotocol.io');
  await dialog.getByRole('button', { name: /로컬 노트 경로 복사/ }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '~/notes/yg33.md');
  await page.screenshot({ path: `${shots}/${name}-detail.png` });
  pass(`${name}: detail shows all links, linked documents, and copies the local path`);

  await dialog.getByRole('link', { name: /백엔드 설계/ }).click();
  await page.waitForURL(/#document-/);
  await page.locator('nav a[aria-current="page"]', { hasText: '문서' }).first().waitFor({ state: 'attached' });
  await page.getByText('엔드포인트 정리').waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.screenshot({ path: `${shots}/${name}-document.png` });
  pass(`${name}: linked document chip opens the page in the 문서 tab`);
  await context.close();
}
await browser.close();
