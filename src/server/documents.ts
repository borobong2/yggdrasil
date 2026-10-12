import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Document, DocumentIssueLink } from '../contracts/items.js';
import { getDb } from './db.js';
import { appOwners, documentIssueLinks, documents, issues } from './schema.js';
import { NotFoundError } from './work.js';

const db = getDb();

export class DocumentValidationError extends Error {}

export async function createDocument(ownerId: string, title: string, body: string, parentId: string | null, icon: string | null = null): Promise<Document> {
  if (parentId) await liveParent(ownerId, parentId);
  await db.insert(appOwners).values({ ownerId }).onConflictDoNothing();
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${documents.position}), -1)::int + 1` }).from(documents).where(and(eq(documents.ownerId, ownerId), siblingsOf(parentId)));
  return document((await db.insert(documents).values({ id: crypto.randomUUID(), ownerId, title, body, parentId, icon, position: next }).returning())[0]!);
}

/** Live pages in tree order; `archived` lists the trash instead. */
export async function listDocuments(ownerId: string, archived = false): Promise<Document[]> {
  return (await db.select().from(documents).where(and(eq(documents.ownerId, ownerId), archived ? isNotNull(documents.archivedAt) : isNull(documents.archivedAt)))
    .orderBy(asc(documents.position), asc(documents.createdAt), asc(documents.id))).map(document);
}

/** Reparent and reorder: `index` is the slot among the new parent's live children (clamped). */
export async function moveDocument(ownerId: string, id: string, parentId: string | null, index: number): Promise<Document> {
  const current = await documentRow(ownerId, id);
  if (current.archivedAt) throw new DocumentValidationError('Archived document');
  await validParent(ownerId, id, parentId);
  return db.transaction(async (tx) => {
    const siblings = (await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.ownerId, ownerId), siblingsOf(parentId), isNull(documents.archivedAt)))
      .orderBy(asc(documents.position), asc(documents.createdAt), asc(documents.id)).for('update')).map((row) => row.id).filter((sibling) => sibling !== id);
    siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, id);
    for (const [position, sibling] of siblings.entries()) {
      await tx.update(documents).set(sibling === id ? { parentId, position, updatedAt: new Date() } : { position }).where(and(eq(documents.id, sibling), eq(documents.ownerId, ownerId)));
    }
    return document((await tx.select().from(documents).where(eq(documents.id, id)))[0]!);
  });
}

/** Trash a page and every live descendant with one shared timestamp, so restore brings back exactly that batch. */
export async function archiveDocument(ownerId: string, id: string): Promise<Document> {
  const current = await documentRow(ownerId, id);
  if (current.archivedAt) return document(current);
  await db.execute(sql`
    WITH RECURSIVE tree AS (
      SELECT id FROM documents WHERE id = ${id} AND owner_id = ${ownerId}
      UNION ALL SELECT d.id FROM documents d JOIN tree t ON d.parent_id = t.id WHERE d.owner_id = ${ownerId} AND d.archived_at IS NULL
    ) UPDATE documents SET archived_at = now() WHERE id IN (SELECT id FROM tree)`);
  return getDocument(ownerId, id);
}

/** Restore the batch trashed with this page; if its parent is still in the trash, it comes back at the top level. */
export async function restoreDocument(ownerId: string, id: string): Promise<Document> {
  const current = await documentRow(ownerId, id);
  if (!current.archivedAt) return document(current);
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM documents WHERE id = ${id} AND owner_id = ${ownerId}
        UNION ALL SELECT d.id FROM documents d JOIN tree t ON d.parent_id = t.id WHERE d.owner_id = ${ownerId} AND d.archived_at = (SELECT archived_at FROM documents WHERE id = ${id})
      ) UPDATE documents SET archived_at = NULL WHERE id IN (SELECT id FROM tree)`);
    const parent = current.parentId ? (await tx.select().from(documents).where(eq(documents.id, current.parentId)))[0] : undefined;
    if (parent?.archivedAt) {
      const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${documents.position}), -1)::int + 1` }).from(documents).where(and(eq(documents.ownerId, ownerId), isNull(documents.parentId), isNull(documents.archivedAt)));
      await tx.update(documents).set({ parentId: null, position: next }).where(eq(documents.id, id));
    }
  });
  return getDocument(ownerId, id);
}

export async function getDocument(ownerId: string, id: string): Promise<Document> { return document(await documentRow(ownerId, id)); }

export async function updateDocument(ownerId: string, id: string, changes: Partial<{ title: string; body: string; parentId: string | null; icon: string | null }>): Promise<Document> {
  const current = await documentRow(ownerId, id);
  if (changes.parentId !== undefined) await validParent(ownerId, id, changes.parentId);
  const row = (await db.update(documents).set({ ...changes, updatedAt: new Date() }).where(and(eq(documents.id, current.id), eq(documents.ownerId, ownerId))).returning())[0]!;
  return document(row);
}

export async function listIssueLinks(ownerId: string, documentId: string): Promise<DocumentIssueLink[]> {
  await documentRow(ownerId, documentId);
  return (await db.select({ documentId: documentIssueLinks.documentId, issueId: documentIssueLinks.issueId, createdAt: documentIssueLinks.createdAt }).from(documentIssueLinks).innerJoin(documents, eq(documentIssueLinks.documentId, documents.id)).where(and(eq(documentIssueLinks.documentId, documentId), eq(documents.ownerId, ownerId)))).map(linkFor);
}

export async function linkIssue(ownerId: string, documentId: string, issueId: string): Promise<DocumentIssueLink> {
  await documentRow(ownerId, documentId);
  const issue = await db.select().from(issues).where(and(eq(issues.id, issueId), eq(issues.ownerId, ownerId))).limit(1);
  if (!issue[0]) throw new NotFoundError();
  const row = (await db.insert(documentIssueLinks).values({ documentId, issueId }).onConflictDoNothing().returning())[0];
  if (!row) throw new DocumentValidationError('Link already exists');
  return linkFor(row);
}

async function validParent(ownerId: string, id: string, parentId: string | null) {
  if (!parentId) return;
  let parent = await liveParent(ownerId, parentId);
  while (true) {
    if (parent.id === id) throw new DocumentValidationError('Document cycle');
    if (!parent.parentId) return;
    parent = await documentRow(ownerId, parent.parentId);
  }
}

async function liveParent(ownerId: string, parentId: string) {
  const parent = await documentRow(ownerId, parentId);
  if (parent.archivedAt) throw new DocumentValidationError('Parent is archived');
  return parent;
}

function siblingsOf(parentId: string | null) { return parentId ? eq(documents.parentId, parentId) : isNull(documents.parentId); }

async function documentRow(ownerId: string, id: string) {
  const row = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.ownerId, ownerId))).limit(1);
  if (!row[0]) throw new NotFoundError();
  return row[0];
}

function document(row: typeof documents.$inferSelect): Document {
  return { id: row.id, title: row.title, body: row.body, parentId: row.parentId, position: row.position, archivedAt: row.archivedAt?.toISOString() ?? null, icon: row.icon, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function linkFor(row: typeof documentIssueLinks.$inferSelect): DocumentIssueLink { return { documentId: row.documentId, issueId: row.issueId, createdAt: row.createdAt.toISOString() }; }
