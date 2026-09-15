import { and, desc, eq } from 'drizzle-orm';
import type { EvidenceKind, IssueEvidence } from '../contracts/items.js';
import { getDb } from './db.js';
import { getIssue, NotFoundError } from './work.js';
import { issueEvidence } from './schema.js';

const db = getDb();

export async function createEvidence(ownerId: string, issueId: string, value: unknown): Promise<IssueEvidence> {
  await getIssue(ownerId, issueId);
  const parsed = parseEvidenceUrl(value);
  if (!parsed) throw new InvalidEvidenceError();
  return evidence((await db.insert(issueEvidence).values({ id: crypto.randomUUID(), ownerId, issueId, ...parsed }).returning())[0]!);
}

export async function listEvidence(ownerId: string, issueId: string): Promise<IssueEvidence[]> {
  await getIssue(ownerId, issueId);
  return (await db.select().from(issueEvidence).where(and(eq(issueEvidence.ownerId, ownerId), eq(issueEvidence.issueId, issueId))).orderBy(desc(issueEvidence.createdAt), desc(issueEvidence.id))).map(evidence);
}

export async function deleteEvidence(ownerId: string, issueId: string, id: string): Promise<void> {
  await getIssue(ownerId, issueId);
  if (!(await db.delete(issueEvidence).where(and(eq(issueEvidence.id, id), eq(issueEvidence.ownerId, ownerId), eq(issueEvidence.issueId, issueId))).returning({ id: issueEvidence.id }))[0]) throw new NotFoundError();
}

export class InvalidEvidenceError extends Error {}

function parseEvidenceUrl(value: unknown): { url: string; kind: EvidenceKind } | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    parsed.hash = '';
    const match = parsed.hostname === 'github.com' && parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|commit)\/([^/]+)\/?$/);
    if (match) {
      if (match[3] === 'pull' && /^[1-9]\d*$/.test(match[4])) return { url: withoutTrailingSlash(parsed), kind: 'github_pr' };
      if (match[3] === 'commit' && /^[0-9a-f]{7,40}$/i.test(match[4])) return { url: withoutTrailingSlash(parsed), kind: 'github_commit' };
      return null;
    }
    return parsed.hostname === 'github.com' ? null : { url: parsed.toString(), kind: 'deployment' };
  } catch { return null; }
}

function withoutTrailingSlash(url: URL): string { url.pathname = url.pathname.replace(/\/$/, ''); return url.toString(); }
function evidence(row: typeof issueEvidence.$inferSelect): IssueEvidence { return { id: row.id, issueId: row.issueId, url: row.url, kind: row.kind, status: row.status, createdAt: row.createdAt.toISOString() }; }
