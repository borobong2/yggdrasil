import { and, asc, eq, sql } from 'drizzle-orm';
import type { EpicPrefix } from '../contracts/items.js';
import type { Transaction } from './activity.js';
import { getDb } from './db.js';
import { epics, goals, ticketCounters } from './schema.js';
import { NotFoundError } from './work.js';

type Executor = Transaction | ReturnType<typeof getDb>;
export class InvalidPrefixError extends Error {}

export function normalizePrefix(value: string): string {
  const prefix = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,9}$/.test(prefix)) throw new InvalidPrefixError();
  return prefix;
}

/** Next `PREFIX-n` for the owner. One atomic upsert: concurrent callers serialize on the counter row, so no duplicates. */
export async function allocateKey(executor: Executor, ownerId: string, value: string): Promise<string> {
  return (await allocateKeys(executor, ownerId, value, 1))[0]!;
}

/** `count` consecutive keys in one upsert (YG-40 batches). The counter row stays locked until the caller's transaction ends. */
export async function allocateKeys(executor: Executor, ownerId: string, value: string, count: number): Promise<string[]> {
  const prefix = normalizePrefix(value);
  const result = await executor.execute<{ n: number }>(sql`
    INSERT INTO ticket_counters (owner_id, prefix, next_number) VALUES (${ownerId}, ${prefix}, ${count + 1})
    ON CONFLICT (owner_id, prefix) DO UPDATE SET next_number = ticket_counters.next_number + ${count}
    RETURNING next_number - ${count} AS n`);
  const first = Number(result.rows[0]!.n);
  return Array.from({ length: count }, (_, i) => `${prefix}-${first + i}`);
}

/** Ensure the next allocated number is at least `start` (never moves a counter backwards). */
export async function ensureCounterStart(executor: Executor, ownerId: string, value: string, start: number): Promise<void> {
  const prefix = normalizePrefix(value);
  await executor.execute(sql`
    INSERT INTO ticket_counters (owner_id, prefix, next_number) VALUES (${ownerId}, ${prefix}, ${start})
    ON CONFLICT (owner_id, prefix) DO UPDATE SET next_number = greatest(ticket_counters.next_number, excluded.next_number)`);
}

/** YG-36 settings: every epic of the owner with its default prefix and that prefix's next number (null before the first key). */
export async function listEpicPrefixes(ownerId: string): Promise<EpicPrefix[]> {
  return getDb().select({ epicId: epics.id, area: goals.title, epic: epics.title, keyPrefix: epics.keyPrefix, nextNumber: ticketCounters.nextNumber }).from(epics)
    .innerJoin(goals, eq(epics.goalId, goals.id))
    .leftJoin(ticketCounters, and(eq(ticketCounters.ownerId, ownerId), eq(ticketCounters.prefix, epics.keyPrefix)))
    .where(eq(epics.ownerId, ownerId)).orderBy(asc(goals.title), asc(epics.title), asc(epics.id));
}

/** Sets (or clears, with null) an epic's default prefix; `start` raises that prefix's counter, never lowers it. Existing keys are untouched. */
export async function setEpicPrefix(ownerId: string, epicId: string, value: string | null, start?: number): Promise<EpicPrefix> {
  const prefix = value === null ? null : normalizePrefix(value);
  await getDb().transaction(async (tx) => {
    const [row] = await tx.update(epics).set({ keyPrefix: prefix, updatedAt: new Date() }).where(and(eq(epics.id, epicId), eq(epics.ownerId, ownerId))).returning({ id: epics.id });
    if (!row) throw new NotFoundError();
    if (prefix && start !== undefined) await ensureCounterStart(tx, ownerId, prefix, start);
  });
  return (await listEpicPrefixes(ownerId)).find((row) => row.epicId === epicId)!;
}
