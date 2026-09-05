import { desc, eq } from 'drizzle-orm';
import type { Capture } from '../contracts/items.js';
import { createDb } from './db.js';
import { captures } from './schema.js';

const db = createDb();

export async function createCapture(ownerId: string, text: string): Promise<Capture> {
  const [capture] = await db
    .insert(captures)
    .values({ id: crypto.randomUUID(), ownerId, text, status: 'inbox' })
    .returning();
  return serialize(capture!);
}

export async function listCaptures(ownerId: string): Promise<Capture[]> {
  return (await db.select().from(captures).where(eq(captures.ownerId, ownerId)).orderBy(desc(captures.createdAt), desc(captures.id))).map(serialize);
}

function serialize(capture: typeof captures.$inferSelect): Capture {
  return { id: capture.id, text: capture.text, status: 'inbox', createdAt: capture.createdAt.toISOString() };
}
