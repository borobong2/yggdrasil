import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Epic, GitHubSummary, Goal, Issue, IssueStatus, Priority } from '../contracts/items.js';
import { getDb } from './db.js';
import { epics, goals, issueEvidence, issues, recurrences } from './schema.js';
import { spawnNext, toRecurrence } from './recurrences.js';
import { allocateKey } from './ticket-keys.js';

const db = getDb();
export class NotFoundError extends Error {}

export async function createGoal(ownerId: string, title: string): Promise<Goal> { return goal((await db.insert(goals).values({ id: crypto.randomUUID(), ownerId, title }).returning())[0]!); }
export async function listGoals(ownerId: string): Promise<Goal[]> { return (await db.select().from(goals).where(eq(goals.ownerId, ownerId)).orderBy(desc(goals.createdAt), desc(goals.id))).map(goal); }
export async function getGoal(ownerId: string, id: string): Promise<Goal> { return goal(await goalRow(ownerId, id)); }
export async function updateGoal(ownerId: string, id: string, title: string): Promise<Goal> { return goal(await changed(goals, ownerId, id, { title })); }
export async function deleteGoal(ownerId: string, id: string): Promise<void> { await removed(goals, ownerId, id); }

export async function createEpic(ownerId: string, goalId: string, title: string): Promise<Epic> { await goalRow(ownerId, goalId); return epic((await db.insert(epics).values({ id: crypto.randomUUID(), ownerId, goalId, title }).returning())[0]!); }
export async function listEpics(ownerId: string): Promise<Epic[]> { return (await db.select().from(epics).where(eq(epics.ownerId, ownerId)).orderBy(desc(epics.createdAt), desc(epics.id))).map(epic); }
export async function getEpic(ownerId: string, id: string): Promise<Epic> { return epic(await epicRow(ownerId, id)); }
export async function updateEpic(ownerId: string, id: string, title: string): Promise<Epic> { return epic(await changed(epics, ownerId, id, { title })); }
export async function deleteEpic(ownerId: string, id: string): Promise<void> { await removed(epics, ownerId, id); }

export async function createIssue(ownerId: string, epicId: string, title: string, priority: Priority, dueAt: Date | null, prefix?: string): Promise<Issue> {
  await epicRow(ownerId, epicId);
  return db.transaction(async (tx) => {
    const last = (await tx.select({ position: issues.position }).from(issues).where(and(eq(issues.ownerId, ownerId), eq(issues.status, 'backlog'))).orderBy(desc(issues.position)).limit(1))[0];
    const key = prefix ? await allocateKey(tx, ownerId, prefix) : null;
    return issue((await tx.insert(issues).values({ id: crypto.randomUUID(), ownerId, epicId, title, priority, dueAt, key, position: (last?.position ?? -1) + 1 }).returning())[0]!);
  });
}
export async function listIssues(ownerId: string): Promise<Issue[]> {
  const [rows, github] = await Promise.all([db.select({ issue: issues, recurrence: recurrences }).from(issues).leftJoin(recurrences, eq(issues.recurrenceId, recurrences.id)).where(and(eq(issues.ownerId, ownerId), isNull(issues.archivedAt))).orderBy(asc(issues.status), asc(issues.position), asc(issues.id)), githubSummaries(ownerId)]);
  return rows.map((row) => ({ ...issue(row.issue), github: github.get(row.issue.id) ?? null, recurrence: toRecurrence(row.recurrence) }));
}

/** Latest PR and successful deploy per issue, from webhook-written evidence (YG-24). */
async function githubSummaries(ownerId: string): Promise<Map<string, GitHubSummary>> {
  const rows = await db.select().from(issueEvidence).where(and(eq(issueEvidence.ownerId, ownerId), inArray(issueEvidence.kind, ['github_pr', 'deployment']))).orderBy(desc(issueEvidence.createdAt), desc(issueEvidence.id));
  const out = new Map<string, GitHubSummary>();
  for (const row of rows) {
    const summary = out.get(row.issueId) ?? { pr: null, deploy: null };
    if (row.kind === 'github_pr' && !summary.pr && row.prNumber && row.state) summary.pr = { number: row.prNumber, url: row.url, state: row.state, ci: row.ci };
    if (row.kind === 'deployment' && !summary.deploy && row.state === 'success') summary.deploy = { url: row.url, state: row.state };
    if (summary.pr || summary.deploy) out.set(row.issueId, summary);
  }
  return out;
}
export async function getIssue(ownerId: string, id: string): Promise<Issue> { return issue(await issueRow(ownerId, id)); }
export async function updateIssue(ownerId: string, id: string, input: Partial<{ title: string; status: IssueStatus; priority: Priority; dueAt: Date | null }>): Promise<Issue> {
  // This legacy route takes instants only, so a new due date is always timed (YG-38).
  const changes = input.dueAt === undefined ? input : { ...input, dueAllDay: false };
  if (changes.status !== 'done') return issue(await changed(issues, ownerId, id, changes));
  // Completing here must also roll a recurring series forward (YG-28), atomically with the status change.
  return db.transaction(async (tx) => {
    const before = (await tx.select({ status: issues.status }).from(issues).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).for('update'))[0];
    const row = (await tx.update(issues).set({ ...changes, updatedAt: new Date() }).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).returning())[0];
    if (!before || !row) throw new NotFoundError();
    if (before.status !== 'done') await spawnNext(tx, row, { via: 'ui' });
    return issue(row);
  });
}
export async function deleteIssue(ownerId: string, id: string): Promise<void> { await removed(issues, ownerId, id); }

async function goalRow(ownerId: string, id: string) { const row = (await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }
async function epicRow(ownerId: string, id: string) { const row = (await db.select().from(epics).where(and(eq(epics.id, id), eq(epics.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }
async function issueRow(ownerId: string, id: string) { const row = (await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }

async function changed(table: typeof goals, ownerId: string, id: string, changes: Partial<{ title: string }>): Promise<typeof goals.$inferSelect>;
async function changed(table: typeof epics, ownerId: string, id: string, changes: Partial<{ title: string }>): Promise<typeof epics.$inferSelect>;
async function changed(table: typeof issues, ownerId: string, id: string, changes: Partial<{ title: string; status: IssueStatus; priority: Priority; dueAt: Date | null; dueAllDay: boolean }>): Promise<typeof issues.$inferSelect>;
async function changed(table: typeof goals | typeof epics | typeof issues, ownerId: string, id: string, changes: object) {
  const row = (await db.update(table).set({ ...changes, updatedAt: new Date() }).where(and(eq(table.id, id), eq(table.ownerId, ownerId))).returning())[0];
  if (!row) throw new NotFoundError();
  return row;
}

async function removed(table: typeof goals | typeof epics | typeof issues, ownerId: string, id: string): Promise<void> {
  if (!(await db.delete(table).where(and(eq(table.id, id), eq(table.ownerId, ownerId))).returning({ id: table.id }))[0]) throw new NotFoundError();
}

function goal(row: typeof goals.$inferSelect): Goal { return { id: row.id, title: row.title, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
function epic(row: typeof epics.$inferSelect): Epic { return { ...goal(row), goalId: row.goalId }; }
export function issue(row: typeof issues.$inferSelect): Issue { return { id: row.id, title: row.title, epicId: row.epicId, status: row.status, position: row.position, priority: row.priority, dueAt: row.dueAt?.toISOString() ?? null, dueAllDay: row.dueAllDay, hold: row.hold, holdReason: row.holdReason, scheduledAt: row.scheduledAt?.toISOString() ?? null, scheduledAllDay: row.scheduledAllDay, notes: row.notes, estimateMinutes: row.estimateMinutes, source: row.source, key: row.key, completedAt: row.completedAt?.toISOString() ?? null, archivedAt: row.archivedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
