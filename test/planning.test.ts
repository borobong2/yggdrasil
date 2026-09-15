import { describe, expect, it } from 'vitest';
import { app } from '../src/server/app.js';

const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token', 'content-type': 'application/json' };

async function create(path: string, body: object) {
  const response = await app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
  expect(response.status).toBe(201);
  return response.json();
}

describe('planning tree', () => {
  it('returns the owner hierarchy with server-calculated ancestor progress', async () => {
    const goal = await create('/api/goals', { title: 'Ship planning' });
    const epic = await create('/api/epics', { title: 'Progress rollups', goalId: goal.id });
    const done = await create('/api/issues', { title: 'Done work', epicId: epic.id });
    await create('/api/issues', { title: 'Open work', epicId: epic.id });
    expect((await app.request(`/api/issues/${done.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'done' }) })).status).toBe(200);

    const response = await app.request('/api/planning/tree', { headers });

    expect(response.status).toBe(200);
    const tree = await response.json();
    const goalTree = tree.find((item: { id: string }) => item.id === goal.id);
    expect(goalTree).toMatchObject({ ...goal, progress: { done: 1, total: 2, ratio: 0.5 } });
    expect(goalTree.epics.find((item: { id: string }) => item.id === epic.id)).toMatchObject({
      ...epic,
      progress: { done: 1, total: 2, ratio: 0.5 },
      issues: expect.arrayContaining([expect.objectContaining({ id: done.id, status: 'done' }), expect.objectContaining({ status: 'backlog' })])
    });
  });

  it('returns an empty tree and hides foreign hierarchy details', async () => {
    const goal = await create('/api/goals', { title: 'Private hierarchy' });

    expect((await app.request('/api/planning/tree', { headers: other })).status).toBe(200);
    await expect((await app.request('/api/planning/tree', { headers: other })).json()).resolves.toEqual([]);
    expect((await app.request(`/api/goals/${goal.id}`, { headers: other })).status).toBe(404);
  });
});
