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
