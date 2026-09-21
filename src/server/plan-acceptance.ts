import { and, eq, sql } from 'drizzle-orm';
import type { DeliveryPlanAcceptance, DeliveryPlanProposal } from '../contracts/items.js';
import { getDb } from './db.js';
import { validateDeliveryPlan } from './openai.js';
import { activities, appOwners, captures, deliveryPlanAcceptances, deliveryPlanProposals, documentIssueLinks, documents, epics, goals, issues } from './schema.js';

const db = getDb();
export class PlanNotFoundError extends Error {}
export class PlanConflictError extends Error {}
export class PlanValidationError extends Error {}

export async function acceptDeliveryPlan(ownerId: string, proposalId: string): Promise<DeliveryPlanAcceptance> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM delivery_plan_proposals WHERE id = ${proposalId} AND owner_id = ${ownerId} FOR UPDATE`);
    const proposal = (await tx.select().from(deliveryPlanProposals).where(and(eq(deliveryPlanProposals.id, proposalId), eq(deliveryPlanProposals.ownerId, ownerId))).limit(1))[0];
    if (!proposal) throw new PlanNotFoundError();
    if (proposal.status !== 'pending') throw new PlanConflictError();
    let plan: ReturnType<typeof validateDeliveryPlan>;
    try { plan = validateDeliveryPlan({ design: proposal.design, lanes: proposal.lanes }); } catch { throw new PlanValidationError(); }
    const capture = (await tx.select({ id: captures.id }).from(captures).where(and(eq(captures.id, proposal.captureId), eq(captures.ownerId, ownerId))).limit(1))[0];
    if (!capture) throw new PlanNotFoundError();
    await tx.insert(appOwners).values({ ownerId }).onConflictDoNothing();
    const [document] = await tx.insert(documents).values({ id: crypto.randomUUID(), ownerId, title: plan.design.title, body: plan.design.body, parentId: null }).returning();
    const [goal] = await tx.insert(goals).values({ id: crypto.randomUUID(), ownerId, title: plan.design.title }).returning();
    const [epic] = await tx.insert(epics).values({ id: crypto.randomUUID(), ownerId, goalId: goal!.id, title: plan.design.title }).returning();
    const issueRows = await tx.insert(issues).values(Object.values(plan.lanes).flat().map((title, position) => ({ id: crypto.randomUUID(), ownerId, epicId: epic!.id, title, position }))).returning();
    if (issueRows.length) await tx.insert(documentIssueLinks).values(issueRows.map((issue) => ({ documentId: document!.id, issueId: issue.id })));
    const issueIds = issueRows.map((issue) => issue.id);
    const [acceptance] = await tx.insert(deliveryPlanAcceptances).values({ proposalId, ownerId, captureId: capture.id, documentId: document!.id, goalId: goal!.id, epicId: epic!.id, issueIds }).returning();
    await tx.insert(activities).values({ id: crypto.randomUUID(), ownerId, actorId: ownerId, kind: 'delivery-plan.accepted', subjectType: 'delivery-plan-proposal', subjectId: proposalId, payload: { proposalId, captureId: capture.id, documentId: document!.id, goalId: goal!.id, epicId: epic!.id, issueIds } });
    await tx.update(deliveryPlanProposals).set({ status: 'accepted' }).where(eq(deliveryPlanProposals.id, proposalId));
    return accepted(acceptance!);
  });
}

export async function dismissDeliveryPlan(ownerId: string, proposalId: string): Promise<DeliveryPlanProposal> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM delivery_plan_proposals WHERE id = ${proposalId} AND owner_id = ${ownerId} FOR UPDATE`);
    const proposal = (await tx.select().from(deliveryPlanProposals).where(and(eq(deliveryPlanProposals.id, proposalId), eq(deliveryPlanProposals.ownerId, ownerId))).limit(1))[0];
    if (!proposal) throw new PlanNotFoundError();
    if (proposal.status !== 'pending') throw new PlanConflictError();
    const [dismissed] = await tx.update(deliveryPlanProposals).set({ status: 'dismissed' }).where(eq(deliveryPlanProposals.id, proposalId)).returning();
    await tx.insert(activities).values({ id: crypto.randomUUID(), ownerId, actorId: ownerId, kind: 'delivery-plan.dismissed', subjectType: 'delivery-plan-proposal', subjectId: proposalId, payload: { proposalId, captureId: proposal.captureId } });
    return proposalFor(dismissed!);
  });
}

function accepted(row: typeof deliveryPlanAcceptances.$inferSelect): DeliveryPlanAcceptance { return { proposalId: row.proposalId, captureId: row.captureId, documentId: row.documentId, goalId: row.goalId, epicId: row.epicId, issueIds: row.issueIds, acceptedAt: row.acceptedAt.toISOString() }; }
function proposalFor(row: typeof deliveryPlanProposals.$inferSelect): DeliveryPlanProposal { return { id: row.id, captureId: row.captureId, status: row.status, design: row.design, lanes: row.lanes, model: row.model, createdAt: row.createdAt.toISOString() }; }
