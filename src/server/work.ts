import { and, desc, eq } from 'drizzle-orm';
import type { Epic, Goal, Issue, IssueStatus, Priority } from '../contracts/items.js';
import { getDb } from './db.js';
import { epics, goals, issues } from './schema.js';

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

export async function createIssue(ownerId: string, epicId: string, title: string, priority: Priority, dueAt: Date | null): Promise<Issue> { await epicRow(ownerId, epicId); return issue((await db.insert(issues).values({ id: crypto.randomUUID(), ownerId, epicId, title, priority, dueAt }).returning())[0]!); }
export async function listIssues(ownerId: string): Promise<Issue[]> { return (await db.select().from(issues).where(eq(issues.ownerId, ownerId)).orderBy(desc(issues.createdAt), desc(issues.id))).map(issue); }
export async function getIssue(ownerId: string, id: string): Promise<Issue> { return issue(await issueRow(ownerId, id)); }
export async function updateIssue(ownerId: string, id: string, changes: Partial<{ title: string; status: IssueStatus; priority: Priority; dueAt: Date | null }>): Promise<Issue> { return issue(await changed(issues, ownerId, id, changes)); }
export async function deleteIssue(ownerId: string, id: string): Promise<void> { await removed(issues, ownerId, id); }

async function goalRow(ownerId: string, id: string) { const row = (await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }
async function epicRow(ownerId: string, id: string) { const row = (await db.select().from(epics).where(and(eq(epics.id, id), eq(epics.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }
async function issueRow(ownerId: string, id: string) { const row = (await db.select().from(issues).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).limit(1))[0]; if (!row) throw new NotFoundError(); return row; }

async function changed(table: typeof goals, ownerId: string, id: string, changes: Partial<{ title: string }>): Promise<typeof goals.$inferSelect>;
async function changed(table: typeof epics, ownerId: string, id: string, changes: Partial<{ title: string }>): Promise<typeof epics.$inferSelect>;
async function changed(table: typeof issues, ownerId: string, id: string, changes: Partial<{ title: string; status: IssueStatus; priority: Priority; dueAt: Date | null }>): Promise<typeof issues.$inferSelect>;
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
function issue(row: typeof issues.$inferSelect): Issue { return { id: row.id, title: row.title, epicId: row.epicId, status: row.status, priority: row.priority, dueAt: row.dueAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
