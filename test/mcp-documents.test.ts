import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { app, createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import { createCapture } from '../src/server/captures.js';
import { createDocument } from '../src/server/documents.js';
import { issuePat } from '../src/server/pats.js';
import { createTodo } from '../src/server/todos.js';

// YG-33 document tools + YG-42 todo links, over MCP and the UI routes.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

async function connect(owner: string) {
  const server = serve({ fetch: createApp().fetch, port: 0, hostname: '127.0.0.1' });
  if (!server.listening) await new Promise<void>(resolve => server.once('listening', resolve));
  const client = new Client({ name: 'yg33-test', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${(await issuePat(owner, 'yg33')).token}` } } });
  async function close() { await client.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  try { await client.connect(transport); } catch (error) { await close(); throw error; }
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, (result.content as { text: string }[])[0]?.text).not.toBe(true);
    return JSON.parse((result.content as { text: string }[])[0]!.text);
  };
  const fails = async (name: string, args: Record<string, unknown>) => expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
  const read = async (uri: string) => ((await client.readResource({ uri })).contents[0] as { text: string }).text;
  return { call, fails, read, close };
}
const rows = async (owner: string) => Promise.all(['documents', 'document_issue_links', 'activities', 'issues'].map(async (table) =>
  (await pool.query(table === 'document_issue_links'
    ? 'SELECT l.* FROM document_issue_links l JOIN documents d ON d.id = l.document_id WHERE d.owner_id = $1 ORDER BY 1, 2'
    : `SELECT row_to_json(t)::text AS row FROM ${table} t WHERE owner_id = $1 ORDER BY 1`, [owner])).rows));

it('creates, updates, lists and links documents over MCP with via=mcp activity', async () => {
  const owner = crypto.randomUUID();
  const keyed = await createTodo(owner, { area: '개발', title: '백엔드 API', prefix: 'YG' });
  const plain = await createTodo(owner, { area: '개발', title: '키 없음' });
  const { call, fails, close } = await connect(owner);
  try {
    const parent = await call('create_document', { title: '설계', body: '' });
    const doc = await call('create_document', { title: ' 백엔드 메모 ', body: `# API\n\n[@백엔드 API](#issue-${keyed.id})`, parentId: parent.id, icon: '🛠', linkTodos: [keyed.key!.toLowerCase(), plain.id, plain.id] });
    expect(doc).toMatchObject({ title: '백엔드 메모', parentId: parent.id, icon: '🛠', position: 0 });
    expect((await pool.query('SELECT issue_id FROM document_issue_links WHERE document_id = $1 ORDER BY issue_id', [doc.id])).rows.map((row) => row.issue_id)).toEqual([keyed.id, plain.id].sort());

    expect(await call('update_document', { id: doc.id, append: '- 추가 줄' })).toMatchObject({ body: `# API\n\n[@백엔드 API](#issue-${keyed.id})\n\n- 추가 줄` });
    expect(await call('update_document', { id: doc.id, body: '교체된 본문', title: '백엔드 메모 v2', parentId: null, icon: null })).toMatchObject({ body: '교체된 본문', title: '백엔드 메모 v2', parentId: null, icon: null });

    const listed = await call('list_documents', {});
    expect(listed.map((item: { id: string }) => item.id).sort()).toEqual([parent.id, doc.id].sort());
    expect(listed.every((item: object) => !('body' in item))).toBe(true);
    expect((await call('list_documents', { q: '교체된' })).map((item: { id: string }) => item.id)).toEqual([doc.id]);
    expect((await call('list_documents', { parentId: null, limit: 1 }))).toHaveLength(1);
    await app.request(`/api/documents/${parent.id}/archive`, { method: 'POST', headers: { authorization: `Bearer ${await ownerToken(owner)}` } });
    expect((await call('list_documents', {})).map((item: { id: string }) => item.id)).toEqual([doc.id]);
    expect((await call('list_documents', { includeArchived: true }))).toHaveLength(2);

    expect(await call('unlink_document_todo', { documentId: doc.id, todo: 'yg-1' })).toEqual({ documentId: doc.id, issueId: keyed.id, linked: false });
    expect(await call('unlink_document_todo', { documentId: doc.id, todo: 'YG-1' })).toMatchObject({ linked: false });
    expect(await call('link_document_todo', { documentId: doc.id, todo: 'YG-1' })).toMatchObject({ issueId: keyed.id, linked: true });
    expect(await call('link_document_todo', { documentId: doc.id, todo: 'YG-1' })).toMatchObject({ linked: true });

    const { rows: log } = await pool.query("SELECT kind, subject_type, payload->>'via' AS via FROM activities WHERE subject_id = $1 ORDER BY created_at, id", [doc.id]);
    expect(log).toEqual(['document.created', 'document.updated', 'document.updated', 'document.unlinked', 'document.linked'].map((kind) => ({ kind, subject_type: 'document', via: 'mcp' })));

    const before = await rows(owner);
    for (const [name, args] of [
      ['create_document', { title: ' ' }], ['create_document', { title: 'x', icon: '<b>' }], ['create_document', { title: 'x'.repeat(201) }],
      ['create_document', { title: 'x', linkTodos: ['YG-999'] }], ['create_document', { title: 'x', parentId: parent.id }],
      ['update_document', { id: doc.id }], ['update_document', { id: doc.id, body: 'a', append: 'b' }], ['update_document', { id: doc.id, parentId: doc.id }],
      ['update_document', { id: doc.id, ownerId: owner, title: 'x' }], ['list_documents', { limit: 0 }], ['link_document_todo', { documentId: doc.id, todo: 'NOPE-1' }],
      ['link_document_todo', { documentId: 'bad', todo: 'YG-1' }], ['delete_document', { id: doc.id }]
    ] as const) await fails(name, args);
    expect(await rows(owner)).toEqual(before);
  } finally { await close(); }
});

it('keeps documents owner-scoped: another owner cannot read, edit, list or link them', async () => {
  const owner = crypto.randomUUID();
  const intruder = crypto.randomUUID();
  const doc = await createDocument(owner, '비밀 문서', '본문', null);
  const todo = await createTodo(owner, { area: '개발', title: '내 할 일', prefix: 'YG' });
  const mine = await createTodo(intruder, { area: '개발', title: '침입자 할 일', prefix: 'YG' });
  const { call, fails, close } = await connect(intruder);
  try {
    const before = await rows(owner);
    for (const [name, args] of [
      ['read_document', { id: doc.id }], ['update_document', { id: doc.id, title: 'stolen' }], ['update_document', { id: doc.id, append: 'x' }],
      ['link_document_todo', { documentId: doc.id, todo: mine.id }], ['unlink_document_todo', { documentId: doc.id, todo: todo.id }],
      ['create_document', { title: 'x', parentId: doc.id }], ['create_document', { title: 'x', linkTodos: [todo.id] }]
    ] as const) await fails(name, args);
    expect(await call('list_documents', {})).toEqual([]);
    // 'YG-1' resolves to the intruder's own todo, never the owner's.
    const own = await call('create_document', { title: '내 문서', linkTodos: ['YG-1'] });
    expect((await pool.query('SELECT issue_id FROM document_issue_links WHERE document_id = $1', [own.id])).rows).toEqual([{ issue_id: mine.id }]);
    expect(await rows(owner)).toEqual(before);
  } finally { await close(); }
});

it('search_workspace finds documents by body text even when many captures match', async () => {
  const owner = crypto.randomUUID();
  const q = `백엔드-${crypto.randomUUID().slice(0, 8)}`;
  for (let i = 0; i < 55; i++) await createCapture(owner, `${q} 캡처 ${i}`);
  const { call, close } = await connect(owner);
  try {
    const doc = await call('create_document', { title: '서버 설계', body: `## ${q} 구조` });
    const found = await call('search_workspace', { q });
    expect(found).toHaveLength(50);
    expect(found[0]).toMatchObject({ kind: 'document', id: doc.id });
  } finally { await close(); }
});

it('stores validated todo links over MCP and the UI route, and resources show links and linked documents', async () => {
  const owner = crypto.randomUUID();
  const doc = await createDocument(owner, '연결 문서', '', null, '📄');
  const { call, fails, read, close } = await connect(owner);
  try {
    const links = [
      { label: '스펙', kind: 'doc', path: doc.id }, { label: 'PR', kind: 'pr', url: 'https://github.com/borobong2/yggdrasil/pull/1' },
      { label: '노트', kind: 'local', path: '~/notes/yg.md' }, { label: '참고', kind: 'web', url: 'http://example.com/a' }
    ];
    const todo = await call('create_todo', { area: '개발', title: '링크 붙이기', links });
    expect(todo.links).toEqual(links);
    await call('link_document_todo', { documentId: doc.id, todo: todo.id });
    const updated = await call('update_todo', { id: todo.id, removeLinks: ['~/notes/yg.md', '참고'], addLinks: [{ label: '구글 문서', kind: 'doc', url: 'https://docs.google.com/d/1' }] });
    expect(updated.links.map((link: { label: string }) => link.label)).toEqual(['스펙', 'PR', '구글 문서']);

    const [batch] = (await call('create_todos', { items: [{ area: '개발', title: '배치', prefix: 'LK', links: [{ label: 'w', kind: 'web', url: 'https://a.b' }] }] }));
    expect(batch.links).toEqual([{ label: 'w', kind: 'web', url: 'https://a.b' }]);
    expect((await call('update_todo', { key: 'lk-1', removeLinks: ['w'] })).links).toEqual([]);

    const text = await read(`todo://issue/${todo.id}`);
    expect(text).toContain('## 링크');
    expect(text).toContain('- [pr] [PR](https://github.com/borobong2/yggdrasil/pull/1)');
    expect(text).toContain(`- [doc] 스펙: document id: ${doc.id}`);
    expect(text).toContain(`## 연결 문서\n\n- 📄 연결 문서 (document id: ${doc.id})`);

    const before = await rows(owner);
    for (const bad of [
      [{ label: 'x', kind: 'web', url: 'ftp://example.com' }], [{ label: 'x', kind: 'web', url: 'javascript:alert(1)' }], [{ label: 'x', kind: 'local' }],
      [{ label: '', kind: 'web', url: 'https://a.b' }], [{ label: 'x', kind: 'doc', path: 'not-a-uuid' }], [{ label: 'x', kind: 'file', path: '~/a' }],
      [{ label: 'x', kind: 'web', url: 'https://a.b', extra: 1 }], Array.from({ length: 21 }, (_, i) => ({ label: `l${i}`, kind: 'web', url: 'https://a.b' }))
    ]) {
      await fails('update_todo', { id: todo.id, links: bad });
      await fails('create_todo', { area: '개발', title: 'x', links: bad });
    }
    await fails('update_todo', { id: todo.id, addLinks: Array.from({ length: 18 }, (_, i) => ({ label: `l${i}`, kind: 'web', url: 'https://a.b' })) });
    expect(await rows(owner)).toEqual(before);

    const token = await ownerToken(owner);
    const patch = (body: unknown) => app.request(`/api/todos/${todo.id}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await patch({ links: [{ label: 'x', kind: 'web', url: 'file:///etc/passwd' }] })).status).toBe(400);
    const saved = await patch({ links: [{ label: '로컬', kind: 'local', path: '~/work' }] });
    expect(saved.status).toBe(200);
    expect((await saved.json()).links).toEqual([{ label: '로컬', kind: 'local', path: '~/work' }]);
    const issues = await (await app.request('/api/issues', { headers: { authorization: `Bearer ${token}` } })).json();
    expect(issues.find((issue: { id: string }) => issue.id === todo.id).links).toEqual([{ label: '로컬', kind: 'local', path: '~/work' }]);
    const linkedDocs = await app.request(`/api/documents?issueId=${todo.id}`, { headers: { authorization: `Bearer ${token}` } });
    expect((await linkedDocs.json()).map((item: { id: string }) => item.id)).toEqual([doc.id]);
    const otherToken = await ownerToken(crypto.randomUUID());
    expect(await (await app.request(`/api/documents?issueId=${todo.id}`, { headers: { authorization: `Bearer ${otherToken}` } })).json()).toEqual([]);
    expect((await app.request('/api/documents?issueId=bad', { headers: { authorization: `Bearer ${token}` } })).status).toBe(400);
  } finally { await close(); }
});

async function ownerToken(owner: string) { const token = `yg33-${owner}`; installTestOwner(token, { id: owner }); return token; }
