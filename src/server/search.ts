import { sql } from 'drizzle-orm';
import type { SearchResult } from '../contracts/search.js';
import { getDb } from './db.js';

export class SearchValidationError extends Error {}

export async function searchWorkspace(ownerId: string, query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length > 200) throw new SearchValidationError('Search must be at most 200 characters');
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  // ponytail: substring scans suit a personal workspace; add trigram indexes if measured latency grows.
  const result = await getDb().execute(sql`
    SELECT kind, id, left(title, 200) AS title, left(preview, 200) AS preview FROM (
      SELECT 'document' AS kind, id, title, body AS preview FROM documents
        WHERE owner_id = ${ownerId} AND (title ILIKE ${pattern} OR body ILIKE ${pattern})
      UNION ALL SELECT 'goal', id, title, title FROM goals WHERE owner_id = ${ownerId} AND title ILIKE ${pattern}
      UNION ALL SELECT 'epic', id, title, title FROM epics WHERE owner_id = ${ownerId} AND title ILIKE ${pattern}
      UNION ALL SELECT 'issue', id, title, title FROM issues WHERE owner_id = ${ownerId} AND title ILIKE ${pattern}
      UNION ALL SELECT 'capture', id, text, text FROM captures WHERE owner_id = ${ownerId} AND text ILIKE ${pattern}
    ) matches ORDER BY kind, id LIMIT 50
  `);
  return result.rows as SearchResult[];
}
