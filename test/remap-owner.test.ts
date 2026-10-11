import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { afterAll, expect, it } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
afterAll(() => pool.end());

const owned = ['activities', 'captures', 'delivery_plan_acceptances', 'delivery_plan_proposals', 'documents', 'epics', 'goals', 'issue_evidence', 'issues', 'personal_access_tokens', 'suggestions'];

async function remap(...args: string[]) {
  try {
    const { stdout } = await promisify(execFile)('node_modules/.bin/tsx', ['scripts/remap-owner.ts', ...args], { env: process.env });
    return { code: 0, stdout };
  } catch (error) {
    const failed = error as { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout + failed.stderr };
  }
}

async function seed(owner: string) {
  const [capture, proposal, doc, child, goal, epic, issue] = Array.from({ length: 7 }, randomUUID);
  const q = (sql: string, params: unknown[]) => pool.query(sql, params);
  await q('INSERT INTO app_owners (owner_id) VALUES ($1)', [owner]);
  await q("INSERT INTO captures (id, owner_id, text) VALUES ($1, $2, 'c')", [capture, owner]);
  await q("INSERT INTO suggestions (id, owner_id, capture_id, title, type, model) VALUES ($1, $2, $3, 's', 'issue', '{}')", [randomUUID(), owner, capture]);
  await q("INSERT INTO delivery_plan_proposals (id, owner_id, capture_id, status, design, lanes, model) VALUES ($1, $2, $3, 'accepted', '{}', '{}', '{}')", [proposal, owner, capture]);
  await q("INSERT INTO documents (id, owner_id, title) VALUES ($1, $2, 'd')", [doc, owner]);
  await q("INSERT INTO documents (id, owner_id, parent_id, title) VALUES ($1, $2, $3, 'child')", [child, owner, doc]);
  await q("INSERT INTO goals (id, owner_id, title) VALUES ($1, $2, 'g')", [goal, owner]);
  await q("INSERT INTO epics (id, owner_id, goal_id, title) VALUES ($1, $2, $3, 'e')", [epic, owner, goal]);
  await q("INSERT INTO issues (id, owner_id, epic_id, title) VALUES ($1, $2, $3, 'i')", [issue, owner, epic]);
  await q('INSERT INTO document_issue_links (document_id, issue_id) VALUES ($1, $2)', [doc, issue]);
  await q("INSERT INTO issue_evidence (id, owner_id, issue_id, url, kind) VALUES ($1, $2, $3, 'https://github.com/x/y/pull/1', 'github_pr')", [randomUUID(), owner, issue]);
  await q("INSERT INTO delivery_plan_acceptances (proposal_id, owner_id, capture_id, document_id, goal_id, epic_id, issue_ids) VALUES ($1, $2, $3, $4, $5, $6, $7)", [proposal, owner, capture, doc, goal, epic, JSON.stringify([issue])]);
  await q("INSERT INTO activities (id, owner_id, actor_id, kind, subject_type, subject_id) VALUES ($1, $2, $2, 'issue.created', 'issue', $3)", [randomUUID(), owner, issue]);
  await q("INSERT INTO personal_access_tokens (id, owner_id, label, token_hash) VALUES ($1, $2, 'pat', $3)", [randomUUID(), owner, randomUUID()]);
}

async function snapshot(owner: string) {
  const out: Record<string, unknown[]> = {};
  for (const table of owned) out[table] = (await pool.query(`SELECT * FROM ${table} WHERE owner_id = $1 ORDER BY 1`, [owner])).rows;
  out.app_owners = (await pool.query('SELECT * FROM app_owners WHERE owner_id = $1', [owner])).rows;
  return out;
}

it('moves every owner column in one transaction, is rerun-safe, and leaves other owners alone', async () => {
  const [from, to, other] = Array.from({ length: 3 }, randomUUID);
  await seed(from);
  await seed(other);
  const before = await snapshot(from);
  const otherBefore = await snapshot(other);
  for (const table of owned) expect(before[table], table).not.toHaveLength(0);

  const dry = await remap('--from', from, '--to', to, '--dry-run');
  expect(dry.code).toBe(0);
  expect(dry.stdout).toMatch(/issue_evidence\s+1/);
  expect(dry.stdout).toMatch(/total\s+14/);
  expect(await snapshot(from)).toEqual(before);

  const run = await remap('--from', from, '--to', to);
  expect(run.code).toBe(0);
  expect(run.stdout).toMatch(/documents\s+2/);
  const after = await snapshot(to);
  for (const table of owned) expect(after[table], table).toEqual(before[table].map((row) => ({ ...(row as object), owner_id: to, ...('actor_id' in (row as object) ? { actor_id: to } : {}) })));
  expect(after.app_owners).toHaveLength(1);
  for (const rows of Object.values(await snapshot(from))) expect(rows).toHaveLength(0);
  expect(await snapshot(other)).toEqual(otherBefore);
  const orphans = await pool.query('SELECT count(*)::int AS n FROM issue_evidence e LEFT JOIN issues i ON i.id = e.issue_id AND i.owner_id = e.owner_id WHERE i.id IS NULL');
  expect(orphans.rows[0].n).toBe(0);

  const rerun = await remap('--from', from, '--to', to);
  expect(rerun.code).toBe(0);
  expect(rerun.stdout).toMatch(/total\s+0/);
  expect(await snapshot(to)).toEqual(after);
});

it('refuses to merge into an owner that already has data unless forced', async () => {
  const [from, to] = Array.from({ length: 2 }, randomUUID);
  await seed(from);
  await seed(to);
  const refused = await remap('--from', from, '--to', to);
  expect(refused.code).toBe(2);
  expect(refused.stdout).toContain('Refusing');
  expect((await snapshot(from)).issues).toHaveLength(1);

  const forced = await remap('--from', from, '--to', to, '--force');
  expect(forced.code).toBe(0);
  expect((await snapshot(to)).issues).toHaveLength(2);
  expect((await snapshot(from)).issues).toHaveLength(0);
});
