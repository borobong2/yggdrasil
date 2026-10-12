import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { app } from '../src/server/app.js';

const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

async function create(path: string, body: object, requestHeaders = headers) {
  const response = await app.request(path, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
  expect(response.status).toBe(201);
  return response.json();
}

describe('document routes', () => {
  it('creates, nests, edits, and reloads an owner-scoped document tree', async () => {
    const root = await create('/api/documents', { title: 'Design', body: 'Root body' });
    const child = await create('/api/documents', { title: 'API', parentId: root.id });
    const update = await app.request(`/api/documents/${child.id}`, { method: 'PATCH', headers, body: JSON.stringify({ body: 'Plain text', parentId: null }) });

    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ id: child.id, title: 'API', body: 'Plain text', parentId: null });
    expect(await (await app.request('/api/documents', { headers })).json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: root.id, parentId: null }), expect.objectContaining({ id: child.id, parentId: null })
    ]));
  });

  it('rejects cycles and hides documents from another owner', async () => {
    const root = await create('/api/documents', { title: 'Private root' });
    const child = await create('/api/documents', { title: 'Private child', parentId: root.id });

    expect((await app.request(`/api/documents/${root.id}`, { method: 'PATCH', headers, body: JSON.stringify({ parentId: child.id }) })).status).toBe(400);
    expect((await app.request(`/api/documents/${root.id}`, { headers: other })).status).toBe(404);
    expect((await app.request('/api/documents', { headers: other })).json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: root.id })]));
  });

  it('links a document to only the owner’s issues', async () => {
    const goal = await create('/api/goals', { title: 'Goal' });
    const epic = await create('/api/epics', { title: 'Epic', goalId: goal.id });
    const issue = await create('/api/issues', { title: 'Issue', epicId: epic.id });
    const document = await create('/api/documents', { title: 'Linked doc' });

    const link = await app.request(`/api/documents/${document.id}/issue-links`, { method: 'POST', headers, body: JSON.stringify({ issueId: issue.id }) });
    expect(link.status).toBe(201);
    expect(await link.json()).toMatchObject({ documentId: document.id, issueId: issue.id });
    expect((await app.request(`/api/documents/${document.id}/issue-links`, { headers })).status).toBe(200);
    expect((await app.request(`/api/documents/${document.id}/issue-links`, { method: 'POST', headers: other, body: JSON.stringify({ issueId: issue.id }) })).status).toBe(404);
  });
});

it('enforces document ownership with a database foreign key', async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query("select 1 from pg_constraint where conrelid = 'documents'::regclass and confrelid = 'app_owners'::regclass");
  await client.end();
  expect(result.rowCount).toBe(1);
});

describe('YG-23 page tree', () => {
  const post = (path: string, body: object = {}, requestHeaders = headers) => app.request(path, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
  const live = async () => (await (await app.request('/api/documents', { headers })).json()) as { id: string; parentId: string | null; position: number }[];
  const childrenOf = async (parentId: string | null) => (await live()).filter((d) => d.parentId === parentId).map((d) => d.id);

  it('appends new pages, then reorders and reparents them with move', async () => {
    const root = await create('/api/documents', { title: 'Tree root', icon: '🌳' });
    const a = await create('/api/documents', { title: 'A', parentId: root.id });
    const b = await create('/api/documents', { title: 'B', parentId: root.id });
    const c = await create('/api/documents', { title: 'C', parentId: root.id });
    expect(root.icon).toBe('🌳');
    expect(await childrenOf(root.id)).toEqual([a.id, b.id, c.id]);

    const reorder = await post(`/api/documents/${c.id}/move`, { parentId: root.id, index: 0 });
    expect(reorder.status).toBe(200);
    expect(await childrenOf(root.id)).toEqual([c.id, a.id, b.id]);

    const reparent = await post(`/api/documents/${b.id}/move`, { parentId: a.id, index: 99 });
    expect(await reparent.json()).toMatchObject({ id: b.id, parentId: a.id, position: 0 });
    expect(await childrenOf(root.id)).toEqual([c.id, a.id]);
    expect((await post(`/api/documents/${a.id}/move`, { parentId: null, index: 0 })).status).toBe(200);
    expect((await childrenOf(null))[0]).toBe(a.id);
  });

  it('prevents cycles, foreign parents, and bad input on move', async () => {
    const root = await create('/api/documents', { title: 'Cycle root' });
    const child = await create('/api/documents', { title: 'Cycle child', parentId: root.id });
    const grandchild = await create('/api/documents', { title: 'Cycle grandchild', parentId: child.id });
    const foreign = await create('/api/documents', { title: 'Foreign' }, other);

    expect((await post(`/api/documents/${root.id}/move`, { parentId: grandchild.id, index: 0 })).status).toBe(400);
    expect((await post(`/api/documents/${root.id}/move`, { parentId: root.id, index: 0 })).status).toBe(400);
    expect((await post(`/api/documents/${root.id}/move`, { parentId: foreign.id, index: 0 })).status).toBe(404);
    expect((await post(`/api/documents/${root.id}/move`, { parentId: null, index: 0 }, other)).status).toBe(404);
    expect((await post(`/api/documents/${root.id}/move`, { parentId: null, index: -1 })).status).toBe(400);
    expect((await post(`/api/documents/${root.id}/move`, { parentId: null, index: 'x' })).status).toBe(400);
    expect((await app.request(`/api/documents/${child.id}`, { headers })).status).toBe(200);
    expect((await (await app.request(`/api/documents/${child.id}`, { headers })).json()).parentId).toBe(root.id);
  });

  it('archives a subtree to the trash and restores exactly that batch', async () => {
    const root = await create('/api/documents', { title: 'Trash root' });
    const marker = `Trash child ${crypto.randomUUID()}`;
    const child = await create('/api/documents', { title: marker, parentId: root.id });
    const earlier = await create('/api/documents', { title: 'Trashed earlier', parentId: root.id });
    await post(`/api/documents/${earlier.id}/archive`);

    expect((await post(`/api/documents/${root.id}/archive`, {}, other)).status).toBe(404);
    const archived = await post(`/api/documents/${root.id}/archive`);
    expect((await archived.json()).archivedAt).toEqual(expect.any(String));
    expect((await live()).map((d) => d.id)).not.toEqual(expect.arrayContaining([root.id]));
    expect((await live()).map((d) => d.id)).not.toContain(child.id);
    const trash = (await (await app.request('/api/documents?archived=true', { headers })).json()) as { id: string }[];
    expect(trash.map((d) => d.id)).toEqual(expect.arrayContaining([root.id, child.id, earlier.id]));
    expect((await (await app.request('/api/documents?archived=true', { headers: other })).json()).map((d: { id: string }) => d.id)).not.toContain(root.id);
    expect((await post(`/api/documents/${child.id}/move`, { parentId: null, index: 0 })).status).toBe(400);
    await expect((await app.request(`/api/search?q=${encodeURIComponent(marker)}`, { headers })).json()).resolves.toEqual([]);

    expect((await post(`/api/documents/${root.id}/restore`)).status).toBe(200);
    const ids = (await live()).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([root.id, child.id]));
    expect(ids).not.toContain(earlier.id); // trashed separately, stays in the trash

    // Restoring a child whose parent is still trashed brings it back at the top level.
    await post(`/api/documents/${root.id}/archive`);
    expect(await (await post(`/api/documents/${child.id}/restore`)).json()).toMatchObject({ id: child.id, parentId: null, archivedAt: null });
  });

  it('updates icons and rejects markup in them', async () => {
    const page = await create('/api/documents', { title: 'Icon page' });
    const patch = (icon: unknown) => app.request(`/api/documents/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ icon }) });
    expect(await (await patch('📘')).json()).toMatchObject({ icon: '📘' });
    expect(await (await patch(null)).json()).toMatchObject({ icon: null });
    expect((await patch('<script>')).status).toBe(400);
  });

  it('stores and returns the editor markdown unchanged for MCP read_document', async () => {
    const body = '# Plan\n\n- [ ] ship\n\n> [!NOTE]\n> keep markdown\n\n<details>\n<summary>More</summary>\n\nhidden\n</details>';
    const page = await create('/api/documents', { title: 'Markdown page', body });
    expect((await (await app.request(`/api/documents/${page.id}`, { headers })).json()).body).toBe(body);
  });
});
