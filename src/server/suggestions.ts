import { and, desc, eq } from 'drizzle-orm';
import type { Suggestion } from '../contracts/items.js';
import { getDb } from './db.js';
import { captures, suggestions } from './schema.js';
import { validateProposal, type SuggestionProvider } from './openai.js';

const db = getDb();

export async function findCapture(ownerId: string, captureId: string) {
  const [capture] = await db.select().from(captures).where(and(eq(captures.ownerId, ownerId), eq(captures.id, captureId)));
  return capture;
}

export async function generateSuggestion(ownerId: string, capture: typeof captures.$inferSelect, provider: SuggestionProvider): Promise<Suggestion> {
  const result = await provider(capture.text);
  const proposal = validateProposal(result.output);
  if (!result.model || typeof result.model.provider !== 'string' || !result.model.provider.trim() || typeof result.model.name !== 'string' || !result.model.name.trim()) {
    throw new Error('Invalid model metadata');
  }
  const [suggestion] = await db.insert(suggestions).values({
    id: crypto.randomUUID(), ownerId, captureId: capture.id, ...proposal,
    status: 'pending', model: { provider: result.model.provider, name: result.model.name }
  }).returning();
  return serialize(suggestion!);
}

export async function listSuggestions(ownerId: string, captureId: string): Promise<Suggestion[]> {
  return (await db.select().from(suggestions)
    .where(and(eq(suggestions.ownerId, ownerId), eq(suggestions.captureId, captureId)))
    .orderBy(desc(suggestions.createdAt), desc(suggestions.id))).map(serialize);
}

function serialize(row: typeof suggestions.$inferSelect): Suggestion {
  return { id: row.id, captureId: row.captureId, title: row.title, type: row.type,
    ...(row.targetId ? { targetId: row.targetId } : {}), status: row.status, model: row.model };
}
