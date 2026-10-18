import { expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serve } from '@hono/node-server';
import { createApp } from '../src/server/app.js';
import { createDocument, getDocument, listDocuments, updateDocument } from '../src/server/documents.js';
import { issuePat } from '../src/server/pats.js';

const exec = promisify(execFile);
it('prepares and publishes seven HTML editions idempotently, preserving sources and refusing user-edit overwrites', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yg56-study-'));
  const owner = crypto.randomUUID();
  const keys = ['plan', 'llm-core', 'llm-qa', 'llm-mock', 'nlp-core', 'nlp-qa', 'nlp-practice'];
  const ids: Record<string, string> = {};
  const sourceBodies: Record<string, string> = {};
  const cards = (count: number) => Array.from({ length: count }, (_, i) => `## Q${i + 1}\n\n<details><summary>정답 보기</summary>\n\n답변 **${i + 1}**\n\n</details>`).join('\n\n');
  for (const key of keys) {
    sourceBodies[key] = '# ' + key + '\n\n' + (key === 'llm-qa' ? cards(46) : key === 'nlp-qa' ? cards(42) : '## 개념\n\n쉬운 **설명**과 예시.\n\n| 개념 | 뜻 |\n|---|---|\n| RAG | 검색 증강 생성 |');
    ids[key] = (await createDocument(owner, key, sourceBodies[key], null)).id;
  }
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const env = { ...process.env, YGGDRASIL_PAT: (await issuePat(owner, 'yg56-test')).token, YGGDRASIL_MCP_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp` };
  const publish = (mode: string) => exec(process.execPath, ['scripts/publish-study-html.mjs', directory, mode], { env });
  try {
    await writeFile(join(directory, 'published.json'), JSON.stringify(ids));
    await publish('--prepare');
    await exec(process.execPath, ['--import', 'tsx', 'scripts/generate-study-html.ts', directory], { env });
    expect(JSON.parse(await readFile(join(directory, 'html-manifest.json'), 'utf8'))).toHaveLength(7);
    expect((await readFile(join(directory, 'llm-qa.html'), 'utf8')).match(/<details>/g)).toHaveLength(47);
    expect((await readFile(join(directory, 'nlp-qa.html'), 'utf8')).match(/<details>/g)).toHaveLength(43);
    expect(await readFile(join(directory, 'llm-core.html'), 'utf8')).toContain('<dl class="concepts">');
    await publish('--publish'); await publish('--publish');
    const docs = await listDocuments(owner);
    expect(docs).toHaveLength(14);
    expect(docs.filter(d => d.format === 'html')).toHaveLength(7);
    for (const key of keys) expect((await getDocument(owner, ids[key])).body).toBe(sourceBodies[key]);
    const editions = JSON.parse(await readFile(join(directory, 'html-publication.json'), 'utf8'));
    const edited = editions.plan.id;
    await updateDocument(owner, edited, { body: '<p>User note must survive</p>' });
    await expect(publish('--publish')).rejects.toThrow(/Edition was edited/);
    expect((await getDocument(owner, edited)).body).toBe('<p>User note must survive</p>');
    await updateDocument(owner, edited, { body: await readFile(join(directory, 'plan.html'), 'utf8') });
    await updateDocument(owner, ids.plan, { body: '# User changed source' });
    await expect(publish('--publish')).rejects.toThrow(/Source changed/);
    await publish('--prepare');
    await expect(publish('--publish')).rejects.toThrow(/Generated HTML is stale/);
    expect(await listDocuments(owner)).toHaveLength(14);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 30000);
