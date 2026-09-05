import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
