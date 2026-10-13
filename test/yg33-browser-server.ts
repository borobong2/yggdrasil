// Local-only browser fixture for YG-33/42; never imported by production. A fresh dev owner per start.
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from '../src/server/app.js';
import { createDocument, linkIssue } from '../src/server/documents.js';
import { createTodo } from '../src/server/todos.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/yggdrasil_yg33');
const owner = process.env.YGGDRASIL_DEV_OWNER_ID = crypto.randomUUID();
const spec = await createDocument(owner, '백엔드 설계', '# API\n\n엔드포인트 정리', null, '🛠');
const todo = await createTodo(owner, { area: '개발', title: '문서 MCP 붙이기', prefix: 'YG', priority: 'p1', links: [
  { label: '설계 문서', kind: 'doc', path: spec.id }, { label: 'PR #52', kind: 'pr', url: 'https://github.com/borobong2/yggdrasil/pull/52' },
  { label: '로컬 노트', kind: 'local', path: '~/notes/yg33.md' }, { label: 'MCP 스펙', kind: 'web', url: 'https://modelcontextprotocol.io' },
  { label: '참고 자료', kind: 'web', url: 'https://example.com' }
] });
await linkIssue(owner, spec.id, todo.id);
await createTodo(owner, { area: '개발', title: '링크 없는 할 일' });
const app = createApp();
app.use('*', serveStatic({ root: './dist/client' }));
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 3033 }, () => console.log('yg33 fixture on http://127.0.0.1:3033'));
