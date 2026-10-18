import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.CHECK_BASE_URL || 'http://127.0.0.1:3156';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const now = new Date().toISOString();
  const ids = ['00000000-0000-4000-8000-000000000056', '00000000-0000-4000-8000-000000000057'];
  const source = '<!doctype html><html lang="ko"><head><style>body{font:18px/1.8 sans-serif;margin:16px}summary{padding:12px}pre{overflow:auto;max-width:100%}section{margin-top:1000px}</style></head><body><a href="#last">마지막으로</a><details><summary>RAG란?</summary><p>검색 증강 생성</p></details><pre>'+ 'LongCode'.repeat(80) +'</pre><section id="last">마지막 개념</section></body></html>\n';
  const docs = ids.map((id, i) => ({ id, title: i ? '기존 Markdown' : 'HTML 시험 공부', body: i ? '# 기존 내용' : source, format: i ? 'markdown' : 'html', parentId: null, position: i, archivedAt: null, icon: null, createdAt: now, updatedAt: now }));
  const writes = []; let failSave = false; let saveDelay = 120; let failMarker = '';
  await page.route(base + '/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname;
    if (req.method() === 'PATCH') {
      const changes = req.postDataJSON();
      if (failSave || failMarker && String(changes.body).includes(failMarker)) return route.fulfill({ status: 500, body: '{}' }); const doc = docs.find(d => path.endsWith('/' + d.id));
      assert(doc); writes.push({ id: doc.id, changes }); await new Promise(r => setTimeout(r, saveDelay)); Object.assign(doc, changes);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(doc) });
    }
    if (req.method() === 'POST' && path === '/api/documents') {
      const doc = { ...docs[0], ...req.postDataJSON(), id: '00000000-0000-4000-8000-000000000058' };
      docs.push(doc); return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(doc) });
    }
    const data = path === '/api/config' ? {} : path === '/api/documents' ? docs : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto(base + '/#document-' + ids[0]);
  await page.getByTitle('HTML 문서 읽기').waitFor({ timeout: 10000 });
  const frame = page.frameLocator('iframe[title="HTML 문서 읽기"]');
  await frame.getByText('RAG란?', { exact: true }).click();
  await frame.getByText('검색 증강 생성', { exact: true }).waitFor({ state: 'visible' });
  const title = page.getByLabel('제목', { exact: true }); await title.fill('HTML 제목만 변경');
  await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨');
  assert.equal(docs[0].body, source); assert.equal(docs[0].format, 'html');
  await page.getByRole('button', { name: 'HTML 소스 편집', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'HTML 소스', exact: true }); assert.equal(await editor.inputValue(), source);
  const edited = source.replace('검색 증강 생성', '검색 증강 생성 — 수정'); await editor.fill(edited);
  await page.getByRole('button', { name: '읽기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨'); assert.equal(docs[0].body, edited);
  await page.reload(); await page.getByTitle('HTML 문서 읽기').waitFor();
  assert(await frame.getByText('검색 증강 생성 — 수정', { exact: true }).count());
  failSave = true; await page.getByRole('button', { name: 'HTML 소스 편집', exact: true }).click(); await editor.fill(edited + '\n<!-- retry -->');
  await page.getByRole('button', { name: '저장 실패 · 다시 시도' }).waitFor(); failSave = false;
  await page.getByRole('button', { name: '저장 실패 · 다시 시도' }).click(); await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨');
  await editor.fill(edited + '\n<!-- navigate while pending -->');
  await page.getByRole('button', { name: '기존 Markdown', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#document-title')?.value === '기존 Markdown');
  assert.equal(docs[0].body, edited + '\n<!-- navigate while pending -->'); assert.equal(docs[1].body, '# 기존 내용');
  await page.getByRole('button', { name: 'HTML 제목만 변경', exact: true }).click();
  await page.getByTitle('HTML 문서 읽기').waitFor();
  await page.getByRole('button', { name: 'HTML 소스 편집', exact: true }).click();
  saveDelay = 700;
  const started = page.waitForRequest(req => req.method() === 'PATCH' && req.url().endsWith('/' + ids[0]));
  await editor.fill(edited + '\n<!-- first save in flight -->');
  await page.getByRole('button', { name: '기존 Markdown', exact: true }).click(); await started;
  await editor.fill(edited + '\n<!-- newer edit during navigation -->');
  await page.waitForFunction(() => document.querySelector('#document-title')?.value === '기존 Markdown');
  assert.equal(docs[0].body, edited + '\n<!-- newer edit during navigation -->', 'navigation must drain edits made during a save');
  saveDelay = 500;
  await page.getByRole('button', { name: 'HTML 제목만 변경', exact: true }).click();
  await page.getByTitle('HTML 문서 읽기').waitFor();
  await page.getByRole('button', { name: 'HTML 소스 편집', exact: true }).click();
  failMarker = 'newer failing save';
  const nextStarted = page.waitForRequest(req => req.method() === 'PATCH' && req.url().endsWith('/' + ids[0]));
  await editor.fill(edited + '\n<!-- first save before failure -->');
  await page.getByRole('button', { name: '기존 Markdown', exact: true }).click(); await nextStarted;
  await editor.fill(edited + '\n<!-- newer failing save -->');
  await page.getByRole('button', { name: '저장 실패 · 다시 시도' }).waitFor();
  assert.equal(await title.inputValue(), 'HTML 제목만 변경', 'failed navigation must retain the edited document');
  failMarker = ''; saveDelay = 120;
  await page.getByRole('button', { name: '저장 실패 · 다시 시도' }).click();
  await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨');
  assert.equal(docs[0].body, edited + '\n<!-- newer failing save -->');
  await page.getByRole('button', { name: '읽기', exact: true }).click();
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'app overflow ' + width);
    assert((await page.locator('iframe').boundingBox()).width >= (width === 768 ? 400 : 280), 'readable frame width ' + width);
    assert.equal(await frame.locator('html').evaluate(el => el.scrollWidth > el.clientWidth), false, 'frame overflow ' + width);
    await frame.getByText('마지막으로', { exact: true }).click();
    const child = page.frames().find(f => f.parentFrame());
    await child.waitForFunction(() => !!document.querySelector('#last') && document.querySelector('#last').getBoundingClientRect().top < innerHeight);
  }
  await mkdir('docs/evidence', { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/evidence/yg-56-reader-mobile.png', fullPage: true });
  // Real browser tests of the isolated renderer, with deliberately hostile source.
  const requests = []; const blockedRequests = [];
  page.on('requestfailed', req => { if (req.url().startsWith('https://example.invalid')) blockedRequests.push([req.url(), req.failure()?.errorText]); });
  page.on('request', req => { if (req.url().startsWith('https://example.invalid')) requests.push(req.url()); });
  const malicious = `<meta http-equiv="refresh" content="0;url=https://example.invalid/refresh"><base href="https://example.invalid/"><script>parent.__htmlAttack=1</script><img src="https://example.invalid/image" onerror="parent.__htmlAttack=2"><svg onload="parent.__htmlAttack=3"><a href="javascript:alert(1)">svg</a></svg><math><mtext>math</mtext></math><iframe src="https://example.invalid/frame"></iframe><form action="https://example.invalid/form"><input></form><a href="https://example.invalid/link" target="_top">external</a><style>@import url('https://example.invalid/css'); body{background-image:url('https://example.invalid/bg')}</style><p id="safe" onclick="parent.__htmlAttack=4">Safe</p>`;
  const sanitized = await page.evaluate(async source => (await import('/src/client/html-document.ts')).buildHtmlPreview(source), malicious);
  await page.evaluate(source => { const frame = document.querySelector('iframe'); frame.srcdoc = source; }, sanitized);
  await frame.getByText('Safe', { exact: true }).waitFor(); await frame.getByText('Safe', { exact: true }).click();
  assert.equal(await page.locator('iframe').getAttribute('sandbox'), '');
  assert.equal(await frame.locator('script,iframe,form,img,svg,math,base').count(), 0);
  assert.equal(await frame.locator('[onclick],[onerror],[onload]').count(), 0);
  assert.equal(await frame.getByText('external', { exact: true }).getAttribute('href'), null);
  assert.equal(await page.evaluate(() => window.__htmlAttack), undefined); assert.deepEqual(blockedRequests.map(([url]) => url).sort(), [...requests].sort(), 'all external attempts must be blocked');
  assert(blockedRequests.every(([, reason]) => reason === 'csp'), JSON.stringify(blockedRequests));
  assert(page.url().startsWith(base));
  // Generated private study editions can be tested without adding their contents to Git.
  if (process.env.STUDY_HTML_DIR) {
    const privateEvidence = process.env.STUDY_EVIDENCE_DIR || join(tmpdir(), 'yggdrasil-study-evidence');
    await mkdir(privateEvidence, { recursive: true });
    for (const file of (await readdir(process.env.STUDY_HTML_DIR)).filter(f => f.endsWith('.html'))) {
      const html = await readFile(process.env.STUDY_HTML_DIR + '/' + file, 'utf8');
      const preview = await page.evaluate(async source => (await import('/src/client/html-document.ts')).buildHtmlPreview(source), html);
      await page.evaluate(source => { document.querySelector('iframe').srcdoc = source; }, preview);
      await frame.locator('main').waitFor();
      for (const width of [360, 390, 768]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await frame.locator('html').evaluate(el => el.scrollWidth > el.clientWidth), false, file + ' overflow ' + width);
      }
      const summary = frame.locator('summary').first();
      if (await summary.count()) { await summary.click(); assert.equal(await summary.evaluate(el => el.parentElement.open), true); }
      if (file === 'llm-core.html') { await summary.click(); await page.getByLabel('제목', {exact:true}).fill('LLM 핵심 정리 · HTML'); await page.waitForFunction(() => document.querySelector('[data-save-status]')?.textContent === '저장됨'); await page.setViewportSize({width:390,height:844}); await page.evaluate(() => window.scrollTo(0,0)); await frame.locator('html').evaluate(() => window.scrollTo(0,0)); const child = page.frames().find(f=>f.parentFrame()); const box = await page.locator('iframe').boundingBox(); await child.waitForFunction(width=>Math.abs(innerWidth-width)<2, box.width-2); await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); await page.screenshot({path:join(privateEvidence, 'yg-56-study-mobile.png'),fullPage:true}); }
    }
  }
  console.log('PASS: format reader, exact source edits, reload, save retry, navigation, 360/390/768 mobile, anchors, disclosure, sandbox/CSP and study editions. API writes mocked.');
} finally { await browser.close(); }
