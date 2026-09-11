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
