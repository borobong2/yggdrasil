import { and, asc, eq, sql } from 'drizzle-orm';
import type { Issue, IssueStatus } from '../contracts/items.js';
import { getDb } from './db.js';
import { activities, issues } from './schema.js';
import { NotFoundError } from './work.js';

const db = getDb();

export async function moveIssue(ownerId: string, id: string, status: IssueStatus, position: number): Promise<Issue> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM issues WHERE owner_id = ${ownerId} FOR UPDATE`);
    const current = (await tx.select().from(issues).where(and(eq(issues.id, id), eq(issues.ownerId, ownerId))).limit(1))[0];
    if (!current) throw new NotFoundError();
    const ownerIssues = await tx.select().from(issues).where(eq(issues.ownerId, ownerId)).orderBy(asc(issues.position), asc(issues.id));
    const source = ownerIssues.filter((item) => item.status === current.status && item.id !== id);
    const target = current.status === status ? source : ownerIssues.filter((item) => item.status === status);
    target.splice(Math.min(position, target.length), 0, { ...current, status });
    for (const [index, item] of source.entries()) await tx.update(issues).set({ position: index, updatedAt: new Date() }).where(eq(issues.id, item.id));
    for (const [index, item] of target.entries()) await tx.update(issues).set({ status, position: index, updatedAt: new Date() }).where(eq(issues.id, item.id));
    await tx.insert(activities).values({ id: crypto.randomUUID(), ownerId, actorId: ownerId, kind: 'issue.moved', subjectType: 'issue', subjectId: id, payload: { from: current.status, to: status, position } });
    return asIssue({ ...current, status, position: target.findIndex((item) => item.id === id), updatedAt: new Date() });
  });
}

function asIssue(row: typeof issues.$inferSelect): Issue { return { id: row.id, title: row.title, epicId: row.epicId, status: row.status, position: row.position, priority: row.priority, dueAt: row.dueAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
