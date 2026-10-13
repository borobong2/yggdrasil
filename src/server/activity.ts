import { desc, eq } from 'drizzle-orm';
import type { Activity } from '../contracts/items.js';
import { getDb } from './db.js';
import { activities } from './schema.js';

export type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

type ActivityEvent = Pick<Activity, 'kind' | 'subjectType' | 'subjectId' | 'payload'>;
export async function appendActivity(tx: Transaction, ownerId: string, ...events: ActivityEvent[]): Promise<void> {
  if (events.length) await tx.insert(activities).values(events.map((event) => ({ ...event, id: crypto.randomUUID(), ownerId, actorId: ownerId })));
}

export async function listActivities(ownerId: string): Promise<Activity[]> {
  const rows = await getDb().select().from(activities).where(eq(activities.ownerId, ownerId)).orderBy(desc(activities.createdAt), desc(activities.id)).limit(100);
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
