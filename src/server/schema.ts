import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
  priority: text('priority').$type<import('../contracts/items.js').Priority>().notNull().default('medium'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

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
