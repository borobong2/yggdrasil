import { foreignKey, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const appOwners = pgTable('app_owners', {
  ownerId: uuid('owner_id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const captures = pgTable('captures', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  text: text('text').notNull(),
  status: text('status').notNull().default('inbox'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const suggestions = pgTable('suggestions', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  captureId: uuid('capture_id').notNull().references(() => captures.id),
  title: text('title').notNull(),
  type: text('type').$type<import('../contracts/items.js').CoreType>().notNull(),
  targetId: uuid('target_id'),
  status: text('status').$type<'pending'>().notNull().default('pending'),
  model: jsonb('model').$type<import('../contracts/items.js').Suggestion['model']>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const deliveryPlanProposals = pgTable('delivery_plan_proposals', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  captureId: uuid('capture_id').notNull().references(() => captures.id),
  status: text('status').$type<'pending'>().notNull().default('pending'),
  design: jsonb('design').$type<import('../contracts/items.js').DeliveryPlanDesign>().notNull(),
  lanes: jsonb('lanes').$type<import('../contracts/items.js').DeliveryPlanLanes>().notNull(),
  model: jsonb('model').$type<import('../contracts/items.js').DeliveryPlanProposal['model']>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const goals = pgTable('goals', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const epics = pgTable('epics', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  goalId: uuid('goal_id').notNull().references(() => goals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const issues = pgTable('issues', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  epicId: uuid('epic_id').notNull().references(() => epics.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  status: text('status').$type<import('../contracts/items.js').IssueStatus>().notNull().default('backlog'),
  position: integer('position').notNull().default(0),
  priority: text('priority').$type<import('../contracts/items.js').Priority>().notNull().default('medium'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [unique('issues_id_owner_key').on(table.id, table.ownerId)]);

export const activities = pgTable('activities', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  kind: text('kind').$type<import('../contracts/items.js').Activity['kind']>().notNull(),
  subjectType: text('subject_type').$type<import('../contracts/items.js').Activity['subjectType']>().notNull(),
  subjectId: uuid('subject_id').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const issueEvidence = pgTable('issue_evidence', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  issueId: uuid('issue_id').notNull(),
  url: text('url').notNull(),
  kind: text('kind').$type<import('../contracts/items.js').EvidenceKind>().notNull(),
  status: text('status').$type<import('../contracts/items.js').EvidenceStatus>().notNull().default('linked'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [foreignKey({ columns: [table.issueId, table.ownerId], foreignColumns: [issues.id, issues.ownerId], name: 'issue_evidence_issue_owner_fkey' }).onDelete('cascade')]);

export const personalAccessTokens = pgTable('personal_access_tokens', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  label: text('label').notNull(),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true })
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => appOwners.ownerId),
  parentId: uuid('parent_id').references((): any => documents.id),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const documentIssueLinks = pgTable('document_issue_links', {
  documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  issueId: uuid('issue_id').notNull().references(() => issues.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
