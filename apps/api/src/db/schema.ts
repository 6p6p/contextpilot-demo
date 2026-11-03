import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index, check } from 'drizzle-orm/pg-core';

export const conversations = pgTable('conversations', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('conversations_updated_idx').on(table.updatedAt)]).enableRLS();

export const messages = pgTable('messages', {
  id: uuid().primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'restrict' }),
  clientRequestId: uuid('client_request_id').notNull(),
  ordinal: integer().notNull(),
  role: text({ enum: ['user', 'assistant'] }).notNull(),
  content: text().notNull(),
  status: text({ enum: ['completed', 'processing', 'failed'] }).notNull(),
  errorCode: text('error_code'),
  model: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('messages_request_role_idx').on(table.conversationId, table.clientRequestId, table.role),
  uniqueIndex('messages_order_idx').on(table.conversationId, table.ordinal),
  check('messages_role_check', sql`${table.role} in ('user', 'assistant')`),
  check('messages_status_check', sql`${table.status} in ('completed', 'processing', 'failed')`),
  check('messages_ordinal_check', sql`${table.ordinal} >= 0`),
]).enableRLS();
