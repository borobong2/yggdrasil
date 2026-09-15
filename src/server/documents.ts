import { and, desc, eq } from 'drizzle-orm';
import type { Document, DocumentIssueLink } from '../contracts/items.js';
import { getDb } from './db.js';
import { appOwners, documentIssueLinks, documents, issues } from './schema.js';
import { NotFoundError } from './work.js';

const db = getDb();

export class DocumentValidationError extends Error {}

export async function createDocument(ownerId: string, title: string, body: string, parentId: string | null): Promise<Document> {
  if (parentId) await documentRow(ownerId, parentId);
  await db.insert(appOwners).values({ ownerId }).onConflictDoNothing();
  return document((await db.insert(documents).values({ id: crypto.randomUUID(), ownerId, title, body, parentId }).returning())[0]!);
}

export async function listDocuments(ownerId: string): Promise<Document[]> {
  return (await db.select().from(documents).where(eq(documents.ownerId, ownerId)).orderBy(desc(documents.createdAt), desc(documents.id))).map(document);
}

export async function getDocument(ownerId: string, id: string): Promise<Document> { return document(await documentRow(ownerId, id)); }

export async function updateDocument(ownerId: string, id: string, changes: Partial<{ title: string; body: string; parentId: string | null }>): Promise<Document> {
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
  let parent = await documentRow(ownerId, parentId);
  while (true) {
    if (parent.id === id) throw new DocumentValidationError('Document cycle');
    if (!parent.parentId) return;
    parent = await documentRow(ownerId, parent.parentId);
  }
}

async function documentRow(ownerId: string, id: string) {
  const row = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.ownerId, ownerId))).limit(1);
  if (!row[0]) throw new NotFoundError();
  return row[0];
}

function document(row: typeof documents.$inferSelect): Document { return { id: row.id, title: row.title, body: row.body, parentId: row.parentId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
function linkFor(row: typeof documentIssueLinks.$inferSelect): DocumentIssueLink { return { documentId: row.documentId, issueId: row.issueId, createdAt: row.createdAt.toISOString() }; }
