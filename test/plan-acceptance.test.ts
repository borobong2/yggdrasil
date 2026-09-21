import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createApp } from '../src/server/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { authorization: 'Bearer test-owner-token', 'content-type': 'application/json' };
const other = { authorization: 'Bearer test-owner-two-token' };
const plan = { design: { title: 'Garden delivery plan', body: 'Build it in small, reviewable steps.' }, lanes: { fe: ['Capture preview'], be: ['Validate provider output'], docs: ['Document the boundary'] } };
const app = createApp(undefined, async () => ({ output: plan, model: { provider: 'fake', name: 'delivery-v1' } }));

afterAll(() => pool.end());

async function proposal() {
  const capture = await (await app.request('/api/captures', { method: 'POST', headers, body: JSON.stringify({ text: 'Plan a garden' }) })).json();
  const created = await (await app.request(`/api/captures/${capture.id}/delivery-plan`, { method: 'POST', headers })).json();
  return { capture, created };
}

async function counts() {
  const tables = ['documents', 'goals', 'epics', 'issues', 'document_issue_links', 'delivery_plan_acceptances', 'activities', 'delivery_plan_proposals'];
  return Object.fromEntries(await Promise.all(tables.map(async (table) => [table, Number((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count)])));
}

it('accepts a pending proposal once and records one provenance and activity', async () => {
  const { capture, created } = await proposal();
  const response = await app.request(`/api/delivery-plan-proposals/${created.id}/accept`, { method: 'POST', headers });
  expect(response.status).toBe(201);
  const accepted = await response.json();
  expect(accepted).toMatchObject({ proposalId: created.id, captureId: capture.id, issueIds: expect.arrayContaining([]) });
  expect(accepted.issueIds).toHaveLength(3);
  expect((await pool.query('SELECT status FROM delivery_plan_proposals WHERE id = $1', [created.id])).rows).toEqual([{ status: 'accepted' }]);
  expect((await pool.query('SELECT proposal_id, capture_id, document_id, goal_id, epic_id, jsonb_array_length(issue_ids) AS issue_count FROM delivery_plan_acceptances WHERE proposal_id = $1', [created.id])).rows).toEqual([{ proposal_id: created.id, capture_id: capture.id, document_id: accepted.documentId, goal_id: accepted.goalId, epic_id: accepted.epicId, issue_count: 3 }]);
  expect((await pool.query("SELECT kind, subject_type, subject_id, payload->>'proposalId' AS proposal_id FROM activities WHERE subject_id = $1", [created.id])).rows).toEqual([{ kind: 'delivery-plan.accepted', subject_type: 'delivery-plan-proposal', subject_id: created.id, proposal_id: created.id }]);
  expect((await pool.query('SELECT text, status FROM captures WHERE id = $1', [capture.id])).rows).toEqual([{ text: 'Plan a garden', status: 'inbox' }]);
  expect((await (await app.request(`/api/captures/${capture.id}/delivery-plan`, { headers })).json())[0]).toMatchObject({ id: created.id, status: 'accepted', acceptance: { documentId: accepted.documentId, issueIds: accepted.issueIds } });
  expect((await app.request(`/api/delivery-plan-proposals/${created.id}/accept`, { method: 'POST', headers })).status).toBe(409);
});

it('isolates proposal acceptance by owner', async () => {
  const { created } = await proposal();
  expect((await app.request(`/api/delivery-plan-proposals/${created.id}/accept`, { method: 'POST', headers: other })).status).toBe(404);
});

it('rolls back all writes when a document insert fails', async () => {
  const { created } = await proposal();
  const before = await counts();
  await pool.query("CREATE FUNCTION fail_plan_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced document failure'; END; $$; CREATE TRIGGER fail_plan_document BEFORE INSERT ON documents FOR EACH ROW EXECUTE FUNCTION fail_plan_document();");
  try {
    expect((await app.request(`/api/delivery-plan-proposals/${created.id}/accept`, { method: 'POST', headers })).status).toBe(500);
  } finally {
    await pool.query('DROP TRIGGER fail_plan_document ON documents; DROP FUNCTION fail_plan_document();');
  }
  expect(await counts()).toEqual(before);
});

it('dismisses without creating plan work or provenance', async () => {
  const { created } = await proposal();
  const before = await counts();
  const response = await app.request(`/api/delivery-plan-proposals/${created.id}/dismiss`, { method: 'POST', headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: created.id, status: 'dismissed' });
  const after = await counts();
  expect(after.documents).toBe(before.documents);
  expect(after.goals).toBe(before.goals);
  expect(after.epics).toBe(before.epics);
  expect(after.issues).toBe(before.issues);
  expect(after.document_issue_links).toBe(before.document_issue_links);
  expect(after.delivery_plan_acceptances).toBe(before.delivery_plan_acceptances);
  expect(after.activities).toBe(before.activities + 1);
  expect((await pool.query("SELECT kind FROM activities WHERE subject_id = $1", [created.id])).rows).toEqual([{ kind: 'delivery-plan.dismissed' }]);
});
