import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';

const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

async function create(path: string, body: object) {
  const response = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  expect(response.status).toBe(201);
  return response.json();
}

describe('work routes', () => {
  it('creates, reads, updates, and deletes an owner-scoped Goal → Epic → Issue hierarchy', async () => {
    const goal = await create('/api/goals', { title: 'Ship core model' });
    const epic = await create('/api/epics', { title: 'Hierarchy API', goalId: goal.id });
    const issue = await create('/api/issues', {
      title: 'Validate parents', epicId: epic.id, priority: 'high', dueAt: '2026-10-01T00:00:00.000Z'
    });

    expect(issue).toMatchObject({ epicId: epic.id, status: 'backlog', priority: 'high', dueAt: '2026-10-01T00:00:00.000Z' });
    expect((await (await app.request('/api/goals', { headers })).json()).map((item: { id: string }) => item.id)).toContain(goal.id);

    const update = await app.request(`/api/issues/${issue.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ title: 'Validate hierarchy', status: 'doing', priority: 'low', dueAt: null })
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ title: 'Validate hierarchy', status: 'doing', priority: 'low', dueAt: null });

    expect((await app.request(`/api/goals/${goal.id}`, { method: 'DELETE', headers })).status).toBe(204);
    expect((await app.request(`/api/epics/${epic.id}`, { headers })).status).toBe(404);
  });

  it('rejects invalid parents and issue fields', async () => {
    expect((await app.request('/api/epics', { method: 'POST', headers, body: JSON.stringify({ title: 'No parent', goalId: crypto.randomUUID() }) })).status).toBe(404);
    expect((await app.request('/api/issues', { method: 'POST', headers, body: JSON.stringify({ title: 'Bad priority', epicId: crypto.randomUUID(), priority: 'urgent' }) })).status).toBe(400);
    expect((await app.request('/api/goals/not-a-uuid', { headers })).status).toBe(400);
  });

  it('hides all hierarchy reads and writes from another owner', async () => {
    const goal = await create('/api/goals', { title: 'Private goal' });
    expect((await app.request(`/api/goals/${goal.id}`, { headers: other })).status).toBe(404);
    expect((await app.request(`/api/goals/${goal.id}`, { method: 'PATCH', headers: other, body: JSON.stringify({ title: 'Stolen' }) })).status).toBe(404);
    expect((await app.request('/api/epics', { method: 'POST', headers: other, body: JSON.stringify({ title: 'Foreign child', goalId: goal.id }) })).status).toBe(404);
    expect((await (await app.request('/api/goals', { headers: other })).json()).map((item: { id: string }) => item.id)).not.toContain(goal.id);
  });
});
