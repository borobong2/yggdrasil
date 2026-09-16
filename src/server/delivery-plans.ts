import { and, desc, eq } from 'drizzle-orm';
import type { DeliveryPlanProposal } from '../contracts/items.js';
import { getDb } from './db.js';
import { type DeliveryPlanProvider, validateDeliveryPlan } from './openai.js';
import { captures, deliveryPlanAcceptances, deliveryPlanProposals } from './schema.js';

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
  return (await db.select({ proposal: deliveryPlanProposals, acceptance: deliveryPlanAcceptances }).from(deliveryPlanProposals).leftJoin(deliveryPlanAcceptances, eq(deliveryPlanAcceptances.proposalId, deliveryPlanProposals.id)).where(and(eq(deliveryPlanProposals.ownerId, ownerId), eq(deliveryPlanProposals.captureId, captureId))).orderBy(desc(deliveryPlanProposals.createdAt), desc(deliveryPlanProposals.id))).map(({ proposal, acceptance }) => serialize(proposal, acceptance));
}

function serialize(row: typeof deliveryPlanProposals.$inferSelect, acceptance?: typeof deliveryPlanAcceptances.$inferSelect | null): DeliveryPlanProposal {
  return { id: row.id, captureId: row.captureId, status: row.status, design: row.design, lanes: row.lanes, model: row.model, createdAt: row.createdAt.toISOString(), ...(acceptance ? { acceptance: { proposalId: acceptance.proposalId, captureId: acceptance.captureId, documentId: acceptance.documentId, goalId: acceptance.goalId, epicId: acceptance.epicId, issueIds: acceptance.issueIds, acceptedAt: acceptance.acceptedAt.toISOString() } } : {}) };
}
