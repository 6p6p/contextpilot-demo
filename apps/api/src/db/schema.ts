import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index, check, customType, boolean, jsonb } from 'drizzle-orm/pg-core';
import type { Citation } from '../../../../shared/documents.js';
import type { Evidence, MeetingAnalysis } from '../../../../shared/meetings.js';
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
  searchMode: text('search_mode', { enum: ['auto', 'required', 'off'] }).notNull().default('off'),
  webSources: jsonb('web_sources').$type<import('../../../../shared/search.js').WebSource[]>().notNull().default([]),
  memorySources: jsonb('memory_sources').$type<import('../../../../shared/memory.js').MemoryCitation[]>().notNull().default([]),
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

export const meetings = pgTable('meetings', {
  id: uuid().primaryKey(), filename: text().notNull(), sha256: text().notNull().unique(), size: integer().notNull(),
  objectKey: text('object_key').notNull(), storageOrigin: text('storage_origin').notNull(), storageBucket: text('storage_bucket').notNull(),
  transcript: text().notNull(), lineCount: integer('line_count').notNull(), storageReady: boolean('storage_ready').notNull().default(false),
  status: text({ enum: ['uploaded', 'processing', 'ready', 'failed'] }).notNull(), requestedVersion: integer('requested_version').notNull().default(1), currentAnalysisId: uuid('current_analysis_id'),
  attempts: integer().notNull().default(0), leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  errorCode: text('error_code'), errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('meetings_status_check', sql`${t.status} in ('uploaded','processing','ready','failed')`), check('meetings_size_check', sql`${t.size} > 0 and ${t.size} <= 1048576`), index('meetings_queue_idx').on(t.status, t.leaseUntil)]).enableRLS();
export const meetingAnalyses = pgTable('meeting_analyses', {
  id: uuid().primaryKey().defaultRandom(), meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'restrict' }),
  version: integer().notNull(), result: jsonb().$type<MeetingAnalysis>().notNull(), model: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('meeting_analysis_version_idx').on(t.meetingId, t.version)]).enableRLS();
export const meetingRisks = pgTable('meeting_risks', {
  id: uuid().primaryKey().defaultRandom(), meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'restrict' }), analysisId: uuid('analysis_id').notNull().references(() => meetingAnalyses.id, { onDelete: 'restrict' }),
  type: text().notNull(), level: text().notNull(), description: text().notNull(), impact: text().notNull(),
}).enableRLS();
export const riskEvidence = pgTable('risk_evidence', {
  id: uuid().primaryKey().defaultRandom(), riskId: uuid('risk_id').notNull().references(() => meetingRisks.id, { onDelete: 'restrict' }),
  startLine: integer('start_line').notNull(), endLine: integer('end_line').notNull(), quote: text().notNull(),
}, t => [check('risk_evidence_lines_check', sql`${t.startLine} >= 1 and ${t.endLine} >= ${t.startLine}`)]).enableRLS();
export const meetingTodos = pgTable('meeting_todos', {
  id: uuid().primaryKey().defaultRandom(), meetingId: uuid('meeting_id').notNull().references(() => meetings.id, { onDelete: 'restrict' }),
  analysisId: uuid('analysis_id').notNull().references(() => meetingAnalyses.id, { onDelete: 'restrict' }), sourceKey: text('source_key').notNull(),
  task: text().notNull(), owner: text(), dueDate: text('due_date'), status: text({ enum: ['open', 'in_progress', 'done'] }).notNull().default('open'),
  origin: text({ enum: ['meeting_action', 'risk_followup', 'meeting_question'] }).notNull().default('meeting_action'),
  evidence: jsonb().$type<Evidence>().notNull(), riskIds: jsonb('risk_ids').$type<string[]>().notNull().default([]),
  version: integer().notNull().default(1), userEdited: boolean('user_edited').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('meeting_todos_source_idx').on(t.meetingId, t.sourceKey), check('meeting_todo_status_check', sql`${t.status} in ('open','in_progress','done')`)]).enableRLS();
export const emailDrafts = pgTable('email_drafts', {
  id: uuid().primaryKey().defaultRandom(), meetingId: uuid('meeting_id').notNull().unique().references(() => meetings.id, { onDelete: 'restrict' }), analysisId: uuid('analysis_id').notNull().references(() => meetingAnalyses.id, { onDelete: 'restrict' }),
  riskIds: jsonb('risk_ids').$type<string[]>().notNull(), todoIds: jsonb('todo_ids').$type<string[]>().notNull(), recipients: jsonb().$type<string[]>().notNull().default([]),
  subject: text().notNull(), body: text().notNull(), version: integer().notNull().default(1), state: text({ enum: ['draft', 'confirmed'] }).notNull().default('draft'),
  deliveryState: text('delivery_state').notNull().default('not_sent'), userEdited: boolean('user_edited').notNull().default(false), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('draft_state_check', sql`${t.state} in ('draft','confirmed') and ${t.deliveryState} = 'not_sent'`)]).enableRLS();
export const emailDraftConfirmations = pgTable('email_draft_confirmations', {
  id: uuid().primaryKey().defaultRandom(), draftId: uuid('draft_id').notNull().references(() => emailDrafts.id, { onDelete: 'restrict' }), version: integer().notNull(),
  snapshot: jsonb().$type<{ recipients: string[]; subject: string; body: string; analysisId: string }>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('draft_confirmation_version_idx').on(t.draftId, t.version)]).enableRLS();

// Phase 5: immutable source jobs and evidence-backed facts, isolated by server-owned scope.
export const memoryJobs = pgTable('memory_jobs', {
  id: uuid().primaryKey().defaultRandom(), scope: text().notNull(),
  messageId: uuid('message_id').references(() => messages.id, { onDelete: 'restrict' }),
  analysisId: uuid('analysis_id').references(() => meetingAnalyses.id, { onDelete: 'restrict' }),
  status: text({ enum: ['queued', 'processing', 'ready', 'failed'] }).notNull().default('queued'),
  attempts: integer().notNull().default(0), leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  errorCode: text('error_code'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('memory_job_message_idx').on(t.scope, t.messageId), uniqueIndex('memory_job_analysis_idx').on(t.scope, t.analysisId),
  check('memory_job_source_check', sql`(${t.messageId} is null) <> (${t.analysisId} is null)`),
  check('memory_job_status_check', sql`${t.status} in ('queued','processing','ready','failed')`), index('memory_job_queue_idx').on(t.scope, t.status, t.leaseUntil)]).enableRLS();
export const memories = pgTable('memories', {
  id: uuid().primaryKey().defaultRandom(), scope: text().notNull(), sourceGroup: uuid('source_group').notNull(), fingerprint: text().notNull(),
  kind: text().$type<import('../../../../shared/memory.js').ExtractedMemory['kind']>().notNull(), content: text().notNull(), quote: text().notNull(),
  sources: jsonb().$type<import('../../../../shared/memory.js').MemoryCitation['sources']>().notNull(),
  embedding: variableVector(), dimensions: integer(), embeddingSpace: text('embedding_space'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('memory_fact_identity_idx').on(t.scope, t.sourceGroup, t.fingerprint),
  check('memory_kind_check', sql`${t.kind} in ('person','time','place','topic','event','decision')`),
  check('memory_vector_check', sql`(${t.embedding} is null and ${t.dimensions} is null and ${t.embeddingSpace} is null) or (${t.embedding} is not null and ${t.dimensions} is not null and ${t.embeddingSpace} is not null and vector_dims(${t.embedding}) = ${t.dimensions} and ${t.dimensions} between 1 and 4096)`),
  index('memories_scope_idx').on(t.scope)]).enableRLS();

// Email send identity is permanent across scopes and provider idempotency expiry.
export const emailDeliveries = pgTable('email_deliveries', {
  id: uuid().primaryKey().defaultRandom(), scope: text().notNull(), configIdentity: text('config_identity').notNull(),
  draftId: uuid('draft_id').notNull().references(() => emailDrafts.id, { onDelete: 'restrict' }),
  confirmationId: uuid('confirmation_id').notNull().references(() => emailDraftConfirmations.id, { onDelete: 'restrict' }),
  version: integer().notNull(), analysisId: uuid('analysis_id').notNull().references(() => meetingAnalyses.id, { onDelete: 'restrict' }),
  sender: text().notNull(), recipients: jsonb().$type<string[]>().notNull(), subject: text().notNull(), body: text().notNull(),
  payloadHash: text('payload_hash').notNull(), idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text({ enum: ['queued', 'processing', 'accepted', 'delivered', 'failed', 'unknown'] }).notNull().default('queued'),
  leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until', { withTimezone: true }),
  providerMessageId: text('provider_message_id'), providerRequestId: text('provider_request_id'), providerEvent: text('provider_event'),
  errorCode: text('error_code'), requestId: text('request_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }), acceptedAt: timestamp('accepted_at', { withTimezone: true }), checkedAt: timestamp('checked_at', { withTimezone: true }),
}, t => [uniqueIndex('email_delivery_draft_version_idx').on(t.draftId, t.version),
  check('email_delivery_status_check', sql`${t.status} in ('queued','processing','accepted','delivered','failed','unknown')`),
  check('email_delivery_version_check', sql`${t.version} > 0`),
  index('email_delivery_queue_idx').on(t.scope, t.configIdentity, t.status, t.leaseUntil)]).enableRLS();

// One durable PPT job per persisted assistant message. Output intent exists before Storage upload.
export const presentationJobs = pgTable('presentation_jobs', {
  id: uuid().primaryKey().defaultRandom(), scope: text().notNull(),
  assistantMessageId: uuid('assistant_message_id').notNull().references(()=>messages.id,{onDelete:'restrict'}),
  conversationId: uuid('conversation_id').notNull().references(()=>conversations.id,{onDelete:'restrict'}),
  request: text().notNull(), requestHash: text('request_hash').notNull(),
  context: jsonb().$type<import('../../../../shared/presentations.js').PresentationContext & {knowledgeMode:boolean; searchMode:import('../../../../shared/search.js').SearchMode;artifactPublication?:import('../presentations/publication.js').Publication; planningOutput?:string;planningHistory?: {sources?:import('../../../../shared/presentations.js').PptSource[]|null;output?:string;plan:import('../../../../shared/presentations.js').PptPlan|null;sha256:string|null;errorCode:string|null;recordedAt:string}[]}>().notNull(),
  topic: text().notNull(), pageCount: integer('page_count').notNull(),
  status: text({enum:['queued','planning','rendering','ready','failed']}).notNull().default('queued'),
  sources: jsonb().$type<import('../../../../shared/presentations.js').PptSource[] | null>(),
  plan: jsonb().$type<import('../../../../shared/presentations.js').PptPlan | null>(),
  objectKey: text('object_key').notNull(), storageOrigin: text('storage_origin').notNull(), storageBucket:text('storage_bucket').notNull(),
  filename: text().notNull(), size: integer(), sha256: text(),
  attempts: integer().notNull().default(0), retries: integer().notNull().default(0), leaseToken: uuid('lease_token'), leaseUntil: timestamp('lease_until',{withTimezone:true}),
  errorCode: text('error_code'), errorMessage: text('error_message'),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(), updatedAt: timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex('presentation_message_idx').on(t.assistantMessageId),uniqueIndex('presentation_object_idx').on(t.objectKey),
  index('presentation_queue_idx').on(t.scope,t.status,t.leaseUntil),
  check('presentation_page_count_check',sql`${t.pageCount} between 5 and 10`),
  check('presentation_attempts_check',sql`${t.attempts} between 0 and 2 and ${t.retries} between 0 and 1`),
  check('presentation_status_check',sql`${t.status} in ('queued','planning','rendering','ready','failed')`),
]).enableRLS();
