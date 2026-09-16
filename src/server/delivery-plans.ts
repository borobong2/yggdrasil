import { and, desc, eq } from 'drizzle-orm';
import type { DeliveryPlanProposal } from '../contracts/items.js';
import { getDb } from './db.js';
import { type DeliveryPlanProvider, validateDeliveryPlan } from './openai.js';
import { captures, deliveryPlanProposals } from './schema.js';

const db = getDb();

export async function findDeliveryPlanCapture(ownerId: string, captureId: string) {
  const [capture] = await db.select().from(captures).where(and(eq(captures.ownerId, ownerId), eq(captures.id, captureId)));
  return capture;
}

export async function generateDeliveryPlan(ownerId: string, capture: typeof captures.$inferSelect, provider: DeliveryPlanProvider): Promise<DeliveryPlanProposal> {
  const result = await provider(capture.text);
  const plan = validateDeliveryPlan(result.output);
  if (!result.model || typeof result.model.provider !== 'string' || !result.model.provider.trim() || typeof result.model.name !== 'string' || !result.model.name.trim()) throw new Error('Invalid model metadata');
  const [proposal] = await db.insert(deliveryPlanProposals).values({ id: crypto.randomUUID(), ownerId, captureId: capture.id, status: 'pending', ...plan, model: { provider: result.model.provider, name: result.model.name } }).returning();
  return serialize(proposal!);
}

export async function listDeliveryPlans(ownerId: string, captureId: string): Promise<DeliveryPlanProposal[]> {
  return (await db.select().from(deliveryPlanProposals).where(and(eq(deliveryPlanProposals.ownerId, ownerId), eq(deliveryPlanProposals.captureId, captureId))).orderBy(desc(deliveryPlanProposals.createdAt), desc(deliveryPlanProposals.id))).map(serialize);
}

function serialize(row: typeof deliveryPlanProposals.$inferSelect): DeliveryPlanProposal {
  return { id: row.id, captureId: row.captureId, status: row.status, design: row.design, lanes: row.lanes, model: row.model, createdAt: row.createdAt.toISOString() };
}
