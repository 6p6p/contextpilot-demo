import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index, check, customType, boolean, jsonb } from 'drizzle-orm/pg-core';
import type { Citation } from '../../../../shared/documents.js';
// Plain vector allows per-row model dimensions; enforced by SQL CHECK and retrieval space filters.
const variableVector = customType<{ data: number[]; driverData: string }>({
  dataType: () => 'vector', toDriver: value => JSON.stringify(value), fromDriver: value => JSON.parse(value) as number[],
});

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
  knowledgeMode: boolean('knowledge_mode').notNull().default(false),
  sources: jsonb().$type<Citation[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('messages_request_role_idx').on(table.conversationId, table.clientRequestId, table.role),
  uniqueIndex('messages_order_idx').on(table.conversationId, table.ordinal),
  check('messages_role_check', sql`${table.role} in ('user', 'assistant')`),
  check('messages_status_check', sql`${table.status} in ('completed', 'processing', 'failed')`),
  check('messages_ordinal_check', sql`${table.ordinal} >= 0`),
]).enableRLS();

export const documents = pgTable('documents', {
  id: uuid().primaryKey(), filename: text().notNull(), objectKey: text('object_key').notNull(),
  storageOrigin: text('storage_origin').notNull(), storageBucket: text('storage_bucket').notNull(),
  size: integer().notNull(), sha256: text().notNull(),
  status: text({ enum: ['uploaded', 'processing', 'ready', 'failed'] }).notNull(),
  storageReady: boolean('storage_ready').notNull().default(false),
  pageCount: integer('page_count'), chunkCount: integer('chunk_count').notNull().default(0),
  embeddingSpace: text('embedding_space').notNull(), dimensions: integer().notNull(),
  attempts: integer().notNull().default(0), leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  errorCode: text('error_code'), errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('documents_status_check', sql`${t.status} in ('uploaded','processing','ready','failed')`),
  check('documents_size_check', sql`${t.size} > 0 and ${t.size} <= 6291456`),
  check('documents_dimensions_check', sql`${t.dimensions} between 1 and 4096`),
  index('documents_queue_idx').on(t.status, t.leaseUntil),
]).enableRLS();

export const documentChunks = pgTable('document_chunks', {
  id: uuid().primaryKey().defaultRandom(), documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'restrict' }),
  ordinal: integer().notNull(), page: integer().notNull(), startOffset: integer('start_offset').notNull(), endOffset: integer('end_offset').notNull(),
  text: text().notNull(), embedding: variableVector().notNull(), dimensions: integer().notNull(), embeddingSpace: text('embedding_space').notNull(),
}, t => [
  uniqueIndex('document_chunks_ordinal_idx').on(t.documentId, t.ordinal),
  check('document_chunks_dimensions_check', sql`vector_dims(${t.embedding}) = ${t.dimensions} and ${t.dimensions} between 1 and 4096`),
  check('document_chunks_page_check', sql`${t.page} >= 1 and ${t.startOffset} >= 0 and ${t.endOffset} > ${t.startOffset}`),
]).enableRLS();
