import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { IssuedPersonalAccessToken, PersonalAccessToken } from '../contracts/items.js';
import { getDb } from './db.js';
import { personalAccessTokens } from './schema.js';
import { NotFoundError } from './work.js';

const db = getDb();

export async function issuePat(ownerId: string, label: string): Promise<IssuedPersonalAccessToken> {
  const token = `ygpat_${randomBytes(32).toString('base64url')}`;
  const [row] = await db.insert(personalAccessTokens).values({ id: crypto.randomUUID(), ownerId, label, tokenHash: createHash('sha256').update(token).digest('hex') }).returning();
  return { ...pat(row!), token };
}

export async function listPats(ownerId: string): Promise<PersonalAccessToken[]> {
  return (await db.select().from(personalAccessTokens).where(eq(personalAccessTokens.ownerId, ownerId)).orderBy(desc(personalAccessTokens.createdAt), desc(personalAccessTokens.id))).map(pat);
}

export async function revokePat(ownerId: string, id: string): Promise<PersonalAccessToken> {
  const [row] = await db.update(personalAccessTokens).set({ revokedAt: new Date() }).where(and(eq(personalAccessTokens.id, id), eq(personalAccessTokens.ownerId, ownerId))).returning();
  if (!row) throw new NotFoundError();
  return pat(row);
}

function pat(row: typeof personalAccessTokens.$inferSelect): PersonalAccessToken {
  return { id: row.id, label: row.label, createdAt: row.createdAt.toISOString(), revokedAt: row.revokedAt?.toISOString() ?? null, lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
}

export async function authenticatePat(token: string): Promise<{ id: string } | undefined> {
  if (!/^ygpat_[A-Za-z0-9_-]{43}$/.test(token)) return;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const [row] = await db.update(personalAccessTokens).set({ lastUsedAt: new Date() })
    .where(and(eq(personalAccessTokens.tokenHash, tokenHash), isNull(personalAccessTokens.revokedAt)))
    .returning({ id: personalAccessTokens.ownerId });
  return row;
}
