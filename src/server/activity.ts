import { desc, eq } from 'drizzle-orm';
import type { Activity } from '../contracts/items.js';
import { getDb } from './db.js';
import { activities } from './schema.js';

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export async function appendActivity(tx: Transaction, ownerId: string, event: Pick<Activity, 'kind' | 'subjectType' | 'subjectId' | 'payload'>): Promise<void> {
  await tx.insert(activities).values({ ...event, id: crypto.randomUUID(), ownerId, actorId: ownerId });
}

export async function listActivities(ownerId: string): Promise<Activity[]> {
  const rows = await getDb().select().from(activities).where(eq(activities.ownerId, ownerId)).orderBy(desc(activities.createdAt), desc(activities.id)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
