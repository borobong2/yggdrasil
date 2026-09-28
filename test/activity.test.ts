import { afterAll, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';
import { installTestOwner } from '../src/server/auth.js';
import * as deliveryPlans from '../src/server/delivery-plans.js';
import { findDeliveryPlanCapture, generateDeliveryPlan } from '../src/server/delivery-plans.js';
import { acceptDeliveryPlan, dismissDeliveryPlan } from '../src/server/plan-acceptance.js';
import { moveIssue } from '../src/server/board.js';
import { createEvidence } from '../src/server/evidence.js';
import type { DeliveryPlanProvider } from '../src/server/openai.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const owner = crypto.randomUUID();
const otherOwner = crypto.randomUUID();
installTestOwner('activity-owner', { id: owner });
installTestOwner('activity-other', { id: otherOwner });
const headers = { authorization: 'Bearer activity-owner', 'content-type': 'application/json' };
const other = { authorization: 'Bearer activity-other', 'content-type': 'application/json' };
const provider: DeliveryPlanProvider = async () => ({ output: { design: { title: 'Activity plan', body: 'Review first' }, lanes: { fe: ['UI'], be: ['API'], docs: ['Guide'] } }, model: { provider: 'test', name: 'activity' } });
const app = createApp(undefined, provider);
afterAll(() => pool.end());

async function post(path: string, body = {}, auth = headers) {
  return app.request(path, { method: 'POST', headers: auth, body: JSON.stringify(body) });
}
async function capture() {
  const result = await (await post('/api/captures', { text: 'Preserve this source' })).json();
  return (await findDeliveryPlanCapture(owner, result.id))!;
}
async function fixture() {
  const source = await capture();
  const proposal = await generateDeliveryPlan(owner, source, provider);
  const goal = await (await post('/api/goals', { title: 'Activity goal' })).json();
  const epic = await (await post('/api/epics', { title: 'Activity epic', goalId: goal.id })).json();
  const issue = await (await post('/api/issues', { title: 'Activity issue', epicId: epic.id })).json();
  return { source, proposal, issue };
}
async function records() {
  return (await pool.query('SELECT * FROM activities WHERE owner_id = $1 ORDER BY created_at, id', [owner])).rows;
}
async function snapshot() {
  const { rows } = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  return Promise.all(rows.map(async ({ tablename }) => ({ table: tablename, rows: (await pool.query(`SELECT row_to_json(t) AS row FROM "${tablename.replaceAll('"', '""')}" t ORDER BY row_to_json(t)::text`)).rows })));
}

it('records each HTTP mutation once, isolates owners, and preserves source and history', async () => {
  const { source, proposal, issue } = await fixture();
  expect((await records()).filter((row) => row.subject_id === proposal.id)).toMatchObject([{ kind: 'delivery-plan.created', owner_id: owner, actor_id: owner, payload: { captureId: source.id } }]);
  const operations = [
    () => app.request(`/api/issues/${issue.id}/move`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'doing', position: 0 }) }),
    () => post(`/api/issues/${issue.id}/evidence`, { url: 'https://example.com/deploy' }),
    () => post(`/api/delivery-plan-proposals/${proposal.id}/accept`),
    () => post(`/api/captures/${source.id}/delivery-plan`)
  ];
  const kinds = ['issue.moved', 'evidence.added', 'delivery-plan.accepted', 'delivery-plan.created'];
  let evidenceId = '';
  let pendingId = '';
  for (const [index, operation] of operations.entries()) {
    const before = await records();
    const response = await operation();
    expect(response.ok).toBe(true);
    const result = await response.json();
    if (index === 1) evidenceId = result.id;
    if (index === 3) pendingId = result.id;
    const added = (await records()).filter((row) => !before.some((prior) => prior.id === row.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: kinds[index], owner_id: owner, actor_id: owner });
  }
  const beforeDismiss = await records();
  expect((await post(`/api/delivery-plan-proposals/${pendingId}/dismiss`)).status).toBe(200);
  expect((await records()).filter((row) => !beforeDismiss.some((prior) => prior.id === row.id))).toMatchObject([{ kind: 'delivery-plan.dismissed' }]);
  const history = await records();
  expect((await app.request(`/api/issues/${issue.id}/evidence/${evidenceId}`, { method: 'DELETE', headers })).status).toBe(204);
  expect(await records()).toEqual(history);
  expect(await findDeliveryPlanCapture(owner, source.id)).toEqual(source);
  expect((await pool.query('SELECT status FROM issues WHERE id=$1', [issue.id])).rows[0].status).toBe('doing');
  const timeline = await app.request('/api/activities', { headers });
  expect(timeline.status).toBe(200);
  expect(await timeline.json()).toHaveLength(history.length);
  expect(await (await app.request(`/api/activities?ownerId=${owner}`, { headers: other })).json()).toEqual([]);
  expect((await app.request('/api/activities')).status).toBe(401);
  expect((await post('/api/activities', { kind: 'issue.moved' })).status).toBe(404);
  expect((await app.request(`/api/activities/${history[0].id}`, { method: 'DELETE', headers })).status).toBe(404);
});

it('rejects foreign-owner service calls, invalid input and repeated decisions without activities', async () => {
  const { source, proposal, issue } = await fixture();
  const before = await snapshot();
  await expect(generateDeliveryPlan(otherOwner, source, provider)).rejects.toThrow();
  await expect(generateDeliveryPlan(otherOwner, { ...source, ownerId: otherOwner }, provider)).rejects.toThrow();
  await expect(moveIssue(otherOwner, issue.id, 'done', 0)).rejects.toThrow();
  await expect(createEvidence(otherOwner, issue.id, 'https://example.com')).rejects.toThrow();
  await expect(acceptDeliveryPlan(otherOwner, proposal.id)).rejects.toThrow();
  await expect(dismissDeliveryPlan(otherOwner, proposal.id)).rejects.toThrow();
  expect((await post(`/api/issues/${issue.id}/evidence`, { url: 'http://example.com' })).status).toBe(400);
  expect((await post(`/api/captures/${source.id}/delivery-plan`, {}, other)).status).toBe(404);
  expect(await snapshot()).toEqual(before);
  await dismissDeliveryPlan(owner, proposal.id);
  const dismissed = await snapshot();
  expect((await post(`/api/delivery-plan-proposals/${proposal.id}/accept`)).status).toBe(409);
  expect((await post(`/api/delivery-plan-proposals/${proposal.id}/dismiss`)).status).toBe(409);
  expect(await snapshot()).toEqual(dismissed);
});

it('records direct service mutations once without HTTP and uses persisted capture text', async () => {
  const { source, proposal, issue } = await fixture();
  const before = await records();
  const created = await generateDeliveryPlan(owner, { ...source, text: 'forged caller text' }, async (text) => {
    expect(text).toBe(source.text);
    return provider(text);
  });
  await moveIssue(owner, issue.id, 'todo', 0);
  await createEvidence(owner, issue.id, 'https://example.com/service');
  await acceptDeliveryPlan(owner, proposal.id);
  await dismissDeliveryPlan(owner, created.id);
  const added = (await records()).filter((row) => !before.some((prior) => prior.id === row.id));
  expect(added.map((row) => row.kind).sort()).toEqual(['delivery-plan.accepted', 'delivery-plan.created', 'delivery-plan.dismissed', 'evidence.added', 'issue.moved']);
});

it.each(['create', 'move', 'evidence', 'accept', 'dismiss'])('rolls back every business row when %s activity insertion fails', async (kind) => {
  const { source, proposal, issue } = await fixture();
  const before = await snapshot();
  await pool.query("CREATE FUNCTION yg10_fail_activity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced activity failure'; END; $$; CREATE TRIGGER yg10_fail_activity BEFORE INSERT ON activities FOR EACH ROW EXECUTE FUNCTION yg10_fail_activity();");
  try {
    const operations: Record<string, () => Promise<unknown>> = {
      create: () => generateDeliveryPlan(owner, source, provider),
      move: () => moveIssue(owner, issue.id, 'done', 0),
      evidence: () => createEvidence(owner, issue.id, 'https://example.com/rollback'),
      accept: () => acceptDeliveryPlan(owner, proposal.id),
      dismiss: () => dismissDeliveryPlan(owner, proposal.id)
    };
    await expect(operations[kind]()).rejects.toThrow();
  } finally {
    await pool.query('DROP TRIGGER yg10_fail_activity ON activities; DROP FUNCTION yg10_fail_activity();');
  }
  expect(await snapshot()).toEqual(before);
});

it('returns only the authenticated owner latest 100 rows with deterministic timestamp ties', async () => {
  const limitOwner = crypto.randomUUID();
  installTestOwner('activity-limit', { id: limitOwner });
  for (let index = 0; index < 105; index++) {
    await pool.query("INSERT INTO activities (id,owner_id,actor_id,kind,subject_type,subject_id,created_at) VALUES ($1,$2,$2,'issue.moved','issue',$3,$4)", [crypto.randomUUID(), limitOwner, crypto.randomUUID(), index < 5 ? '2020-01-01T00:00:00Z' : '2021-01-01T00:00:00Z']);
  }
  const response = await app.request(`/api/activities?limit=1000&ownerId=${owner}`, { headers: { authorization: 'Bearer activity-limit' } });
  expect(response.status).toBe(200);
  const rows = await response.json();
  expect(rows).toHaveLength(100);
  expect(rows.every((row: { ownerId: string; createdAt: string }) => row.ownerId === limitOwner && row.createdAt === '2021-01-01T00:00:00.000Z')).toBe(true);
  const expected = (await pool.query('SELECT id FROM activities WHERE owner_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100', [limitOwner])).rows.map((row) => row.id);
  expect(rows.map((row: { id: string }) => row.id)).toEqual(expected);
});

it('keeps every table unchanged on provider failure or malformed output', async () => {
  const source = await capture();
  const before = await snapshot();
  await expect(generateDeliveryPlan(owner, source, async () => { throw new Error('provider failed'); })).rejects.toThrow();
  await expect(generateDeliveryPlan(owner, source, async () => ({ output: null, model: { provider: 'test', name: 'invalid' } }))).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});

it('returns 404 without activity when a capture disappears between route and service checks', async () => {
  const source = await capture();
  const history = await records();
  // Force the real deletion race after the route lookup, before the service recheck.
  const lookup = vi.spyOn(deliveryPlans, 'findDeliveryPlanCapture').mockImplementationOnce(async () => {
    await pool.query('DELETE FROM captures WHERE id=$1', [source.id]);
    return source;
  });
  try {
    expect((await post(`/api/captures/${source.id}/delivery-plan`)).status).toBe(404);
    expect(await records()).toEqual(history);
  } finally { lookup.mockRestore(); }
});
