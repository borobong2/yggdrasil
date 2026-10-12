import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { GitHubRepo, IssueStatus } from '../contracts/items.js';
import { appendActivity, type Transaction } from './activity.js';
import { getDb } from './db.js';
import { githubDeliveries, githubRepos, issueEvidence, issues } from './schema.js';
import { ensureCounterStart, normalizePrefix } from './ticket-keys.js';
import { NotFoundError } from './work.js';

const db = getDb();
/** Company orgs are never connected (personal workspace only). */
export const BLOCKED_GITHUB_OWNERS = ['creatived-digital-lab'];

export class InvalidRepoError extends Error {}
export class BlockedRepoError extends Error {}

// ---- Connected repos (owner-scoped) ----

export async function listRepos(ownerId: string): Promise<GitHubRepo[]> {
  return (await db.select().from(githubRepos).where(eq(githubRepos.ownerId, ownerId)).orderBy(desc(githubRepos.createdAt), desc(githubRepos.id))).map(repo);
}

/** Idempotent: re-connecting a repo updates its prefix. `start` raises the prefix counter (e.g. YG starts at 24). */
export async function connectRepo(ownerId: string, fullNameInput: unknown, prefixInput: unknown, start?: unknown): Promise<GitHubRepo> {
  if (typeof fullNameInput !== 'string' || typeof prefixInput !== 'string' || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(fullNameInput.trim())) throw new InvalidRepoError();
  if (start !== undefined && (typeof start !== 'number' || !Number.isInteger(start) || start < 1 || start > 1_000_000)) throw new InvalidRepoError();
  const fullName = fullNameInput.trim().toLowerCase();
  if (isBlockedRepo(fullName)) throw new BlockedRepoError();
  let prefix: string;
  try { prefix = normalizePrefix(prefixInput); } catch { throw new InvalidRepoError(); }
  return db.transaction(async (tx) => {
    if (start !== undefined) await ensureCounterStart(tx, ownerId, prefix, start as number);
    const [row] = await tx.insert(githubRepos).values({ id: crypto.randomUUID(), ownerId, fullName, prefix })
      .onConflictDoUpdate({ target: [githubRepos.ownerId, githubRepos.fullName], set: { prefix } }).returning();
    return repo(row!);
  });
}

export async function disconnectRepo(ownerId: string, id: string): Promise<void> {
  if (!(await db.delete(githubRepos).where(and(eq(githubRepos.id, id), eq(githubRepos.ownerId, ownerId))).returning({ id: githubRepos.id }))[0]) throw new NotFoundError();
}

export function isBlockedRepo(fullName: string): boolean {
  return BLOCKED_GITHUB_OWNERS.includes(fullName.split('/')[0]!.toLowerCase());
}

// ---- Webhook ----

export function verifySignature(secret: string, body: string, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Keys like YG-24 in free text, case-insensitive, for one prefix. Returns canonical keys ('YG-24'). */
export function findKeys(prefix: string, texts: unknown[]): string[] {
  const pattern = new RegExp(`(?<![A-Za-z0-9])${prefix}-0*([1-9]\\d{0,8})(?!\\d)`, 'gi');
  const keys = new Set<string>();
  for (const text of texts) if (typeof text === 'string') for (const match of text.matchAll(pattern)) keys.add(`${prefix}-${match[1]}`);
  return [...keys];
}

type Payload = Record<string, any>;
export type WebhookResult = { result: 'duplicate' | 'ignored' | 'processed'; repos: number };

/** One transaction per delivery: the delivery id is recorded with the changes, so a failed delivery can be redelivered. */
export async function handleGitHubEvent(event: string, delivery: string, payload: Payload): Promise<WebhookResult> {
  return db.transaction(async (tx) => {
    const fresh = await tx.insert(githubDeliveries).values({ deliveryId: delivery, event }).onConflictDoNothing().returning({ id: githubDeliveries.deliveryId });
    if (!fresh.length) return { result: 'duplicate', repos: 0 };
    const fullName = typeof payload.repository?.full_name === 'string' ? payload.repository.full_name.toLowerCase() : '';
    const repos = fullName ? await tx.select().from(githubRepos).where(eq(githubRepos.fullName, fullName)) : [];
    if (!repos.length) return { result: 'ignored', repos: 0 };
    for (const row of repos) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${row.ownerId}, 0))`);
      const status = await applyEvent(new Context(tx, row.ownerId, row.prefix, fullName, event, delivery), payload);
      await tx.update(githubRepos).set({ lastEventAt: new Date(), lastStatus: status.slice(0, 200) }).where(eq(githubRepos.id, row.id));
    }
    return { result: 'processed', repos: repos.length };
  });
}

type IssueRow = typeof issues.$inferSelect;
type EvidenceRow = typeof issueEvidence.$inferSelect;
type EvidenceInput = { kind: EvidenceRow['kind']; url: string; state?: string | null; prNumber?: number | null; metadata: Record<string, unknown> };

class Context {
  constructor(readonly tx: Transaction, readonly ownerId: string, readonly prefix: string, readonly repo: string, readonly event: string, readonly delivery: string) {}
  get via() { return { via: 'github', delivery: this.delivery, event: this.event }; }

  async issuesByKey(texts: unknown[]): Promise<IssueRow[]> {
    const keys = findKeys(this.prefix, texts);
    return keys.length ? this.tx.select().from(issues).where(and(eq(issues.ownerId, this.ownerId), inArray(issues.key, keys))) : [];
  }

  async issuesById(ids: string[]): Promise<IssueRow[]> {
    return ids.length ? this.tx.select().from(issues).where(and(eq(issues.ownerId, this.ownerId), inArray(issues.id, ids))) : [];
  }

  /** This repo's GitHub evidence rows matching a PR number or commit sha. */
  async evidenceFor(prNumbers: number[], sha: unknown): Promise<EvidenceRow[]> {
    const rows = await this.tx.select().from(issueEvidence).where(and(eq(issueEvidence.ownerId, this.ownerId), sql`${issueEvidence.metadata}->>'repo' = ${this.repo}`));
    return rows.filter((row) => (row.prNumber !== null && prNumbers.includes(row.prNumber)) || (typeof sha === 'string' && (row.metadata.head_sha === sha || row.metadata.merge_sha === sha)));
  }

  async upsertEvidence(issue: IssueRow, input: EvidenceInput, extra: { ci?: string } = {}): Promise<EvidenceRow> {
    const metadata = { repo: this.repo, ...input.metadata };
    const existing = (await this.tx.select().from(issueEvidence).where(and(eq(issueEvidence.ownerId, this.ownerId), eq(issueEvidence.issueId, issue.id), eq(issueEvidence.kind, input.kind), eq(issueEvidence.url, input.url))).limit(1))[0];
    if (!existing) {
      const [row] = await this.tx.insert(issueEvidence).values({ id: crypto.randomUUID(), ownerId: this.ownerId, issueId: issue.id, url: input.url, kind: input.kind, state: input.state ?? null, prNumber: input.prNumber ?? null, metadata, ...extra }).returning();
      await appendActivity(this.tx, this.ownerId, { kind: 'evidence.added', subjectType: 'issue', subjectId: issue.id, payload: { ...this.via, evidenceId: row!.id, url: row!.url, kind: row!.kind, state: row!.state } });
      return row!;
    }
    const state = input.state ?? existing.state;
    if (state === existing.state && (extra.ci ?? existing.ci) === existing.ci && Object.entries(metadata).every(([key, value]) => existing.metadata[key] === value)) return existing;
    const [row] = await this.tx.update(issueEvidence).set({ state, metadata: { ...existing.metadata, ...metadata }, ...extra }).where(eq(issueEvidence.id, existing.id)).returning();
    await appendActivity(this.tx, this.ownerId, { kind: 'issue.updated', subjectType: 'issue', subjectId: issue.id, payload: { ...this.via, changes: ['evidence'], evidenceId: row!.id, url: row!.url, state: row!.state, ci: row!.ci } });
    return row!;
  }

  async setCi(rows: EvidenceRow[], ci: string): Promise<void> {
    for (const row of rows) {
      if (row.ci === ci) continue;
      await this.tx.update(issueEvidence).set({ ci }).where(eq(issueEvidence.id, row.id));
      await appendActivity(this.tx, this.ownerId, { kind: 'issue.updated', subjectType: 'issue', subjectId: row.issueId, payload: { ...this.via, changes: ['ci'], evidenceId: row.id, url: row.url, ci } });
    }
  }

  async setStatus(issue: IssueRow, status: IssueStatus, note?: string): Promise<void> {
    if (issue.status === status) return;
    // ponytail: same "append to column end" rule as todos.ts nextPosition, kept local to avoid touching that file.
    const [{ next }] = (await this.tx.execute<{ next: number }>(sql`SELECT coalesce(max(position), -1)::int + 1 AS next FROM issues WHERE owner_id = ${this.ownerId} AND status = ${status}`)).rows as [{ next: number }];
    const notes = note ? `${issue.notes}${issue.notes ? '\n' : ''}${note}` : issue.notes;
    await this.tx.update(issues).set({ status, position: next, notes, updatedAt: new Date() }).where(and(eq(issues.id, issue.id), eq(issues.ownerId, this.ownerId)));
    await appendActivity(this.tx, this.ownerId, { kind: status === 'done' ? 'issue.completed' : 'issue.updated', subjectType: 'issue', subjectId: issue.id, payload: { ...this.via, changes: note ? ['status', 'notes'] : ['status'], from: issue.status, to: status } });
  }
}

async function applyEvent(ctx: Context, payload: Payload): Promise<string> {
  const action = typeof payload.action === 'string' ? payload.action : '';
  const label = `${ctx.event}${action ? `.${action}` : ''}`;
  const done = (rows: unknown[]) => `${label} → ${rows.length} issue(s)`;

  if (ctx.event === 'push') {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    if (payload.deleted || !ref.startsWith('refs/heads/')) return `${label}: ignored`;
    const branch = ref.slice('refs/heads/'.length);
    const matched = await ctx.issuesByKey([branch]);
    for (const issue of matched) {
      await ctx.upsertEvidence(issue, { kind: 'github_branch', url: `https://github.com/${ctx.repo}/tree/${branch}`, state: 'pushed', metadata: { branch, head_sha: payload.after } });
      if (issue.status !== 'done') await ctx.setStatus(issue, 'doing');
    }
    return done(matched);
  }

  if (ctx.event === 'pull_request') {
    const pr = payload.pull_request ?? {};
    if (!Number.isInteger(pr.number) || typeof pr.html_url !== 'string' || !pr.html_url.startsWith('https://github.com/')) return `${label}: ignored`;
    const matched = await ctx.issuesByKey([pr.head?.ref, pr.title, pr.body]);
    const state = pr.merged ? 'merged' : pr.state === 'closed' ? 'closed' : 'open';
    for (const issue of matched) {
      await ctx.upsertEvidence(issue, { kind: 'github_pr', url: pr.html_url, state, prNumber: pr.number, metadata: { branch: pr.head?.ref, head_sha: pr.head?.sha, merge_sha: pr.merge_commit_sha ?? undefined, title: pr.title } });
      if (['opened', 'reopened', 'ready_for_review'].includes(action) && issue.status !== 'done') await ctx.setStatus(issue, 'doing');
      if (action === 'closed' && pr.merged) {
        if (typeof pr.merge_commit_sha === 'string' && /^[0-9a-f]{7,40}$/i.test(pr.merge_commit_sha)) {
          await ctx.upsertEvidence(issue, { kind: 'github_commit', url: `https://github.com/${ctx.repo}/commit/${pr.merge_commit_sha}`, state: 'merged', prNumber: pr.number, metadata: { merge_sha: pr.merge_commit_sha } });
        }
        await ctx.setStatus(issue, 'done');
      }
      if (action === 'closed' && !pr.merged && issue.status !== 'done') {
        await ctx.setStatus(issue, 'todo', `[GitHub] PR #${pr.number} 병합 없이 닫힘 (${new Date().toISOString().slice(0, 10)})`);
      }
    }
    return done(matched);
  }

  if (ctx.event === 'check_suite' || ctx.event === 'workflow_run') {
    const run = payload[ctx.event] ?? {};
    if (action !== 'completed' || typeof run.conclusion !== 'string') return `${label}: ignored`;
    const prNumbers = Array.isArray(run.pull_requests) ? run.pull_requests.map((item: any) => item?.number).filter(Number.isInteger) : [];
    const keyed = await ctx.issuesByKey([run.head_branch]);
    const rows = await ctx.evidenceFor(prNumbers, run.head_sha);
    // Keyed branch without a known PR: attach CI to that issue's PR (or branch) evidence from this repo.
    for (const issue of keyed) {
      if (rows.some((row) => row.issueId === issue.id)) continue;
      const candidates = await ctx.tx.select().from(issueEvidence).where(and(eq(issueEvidence.ownerId, ctx.ownerId), eq(issueEvidence.issueId, issue.id), inArray(issueEvidence.kind, ['github_pr', 'github_branch']), sql`${issueEvidence.metadata}->>'repo' = ${ctx.repo}`)).orderBy(desc(issueEvidence.createdAt));
      const target = candidates.find((row) => row.kind === 'github_pr') ?? candidates[0];
      if (target) rows.push(target);
    }
    const targets = rows.filter((row) => row.kind === 'github_pr' || row.kind === 'github_branch');
    await ctx.setCi(targets, run.conclusion);
    return `${label}: ${run.conclusion} → ${new Set(targets.map((row) => row.issueId)).size} issue(s)`;
  }

  if (ctx.event === 'deployment_status') {
    const deployment = payload.deployment ?? {};
    const status = payload.deployment_status ?? {};
    if (typeof status.state !== 'string') return `${label}: ignored`;
    const keyed = await ctx.issuesByKey([deployment.ref]);
    const bySha = await ctx.issuesById([...new Set((await ctx.evidenceFor([], deployment.sha)).map((row) => row.issueId))]);
    const matched = [...new Map([...keyed, ...bySha].map((issue) => [issue.id, issue])).values()];
    const url = [status.environment_url, status.target_url, deployment.payload?.web_url].find((value) => typeof value === 'string' && value.startsWith('https://')) ?? `https://github.com/${ctx.repo}/deployments`;
    for (const issue of matched) {
      await ctx.upsertEvidence(issue, { kind: 'deployment', url, state: status.state, metadata: { environment: deployment.environment, head_sha: deployment.sha } });
    }
    return `${label}: ${status.state} → ${matched.length} issue(s)`;
  }

  return `${label}: ignored`;
}

function repo(row: typeof githubRepos.$inferSelect): GitHubRepo {
  return { id: row.id, fullName: row.fullName, prefix: row.prefix, createdAt: row.createdAt.toISOString(), lastEventAt: row.lastEventAt?.toISOString() ?? null, lastStatus: row.lastStatus };
}
