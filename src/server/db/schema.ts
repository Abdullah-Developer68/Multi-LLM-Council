import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

import type { AttachmentMeta, SeatResponse, TurnSynthesis } from '../../shared/types';

/** Legacy directory table kept from v1 (exposed at /api/users). */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  fullName: text('full_name'),
  phone: varchar('phone', { length: 256 }),
});

export const appAccounts = pgTable('app_accounts', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const appSessions = pgTable('app_sessions', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  accountId: integer('account_id')
    .notNull()
    .references(() => appAccounts.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const chatThreads = pgTable(
  'chat_threads',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull().default('Multi-Agent Deliberation'),
    /** Owner. Null for threads created by v1, which did not scope threads to users. */
    accountId: integer('account_id').references(() => appAccounts.id, { onDelete: 'cascade' }),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('chat_threads_account_idx').on(t.accountId, t.updatedAt)],
);

export interface TurnMeta {
  elapsedMs?: number;
  preferredAgentId?: string | null;
  synthesis?: TurnSynthesis | null;
  contextTurns?: number;
  /** Files attached to the user's message. */
  attachments?: AttachmentMeta[];
}

export const multiAgentTurns = pgTable(
  'multi_agent_turns',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    userPrompt: text('user_prompt').notNull(),
    optimizedPrompt: text('optimized_prompt').notNull(),
    /** v1 column; unused by v2 but kept so old rows stay readable. */
    optimizationDetails: jsonb('optimization_details'),
    /** Synthesized consensus text ('' until the user asks for a synthesis). */
    consensusSolution: text('consensus_solution').notNull(),
    consensusRationale: text('consensus_rationale'),
    agentResponses: jsonb('agent_responses').$type<SeatResponse[]>().notNull(),
    discussionRounds: jsonb('discussion_rounds'),
    rankedAgentIds: jsonb('ranked_agent_ids').$type<string[]>(),
    meta: jsonb('meta').$type<TurnMeta>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('multi_agent_turns_thread_idx').on(t.threadId, t.createdAt)],
);

export const verifiedFreeModels = pgTable('verified_free_models', {
  seatId: text('seat_id').primaryKey(),
  agentName: text('agent_name').notNull(),
  primaryModel: text('primary_model').notNull(),
  fallbackModels: jsonb('fallback_models').$type<string[]>().notNull(),
  provider: text('provider').notNull(),
  isFree: boolean('is_free').notNull().default(true),
  isAvailable: boolean('is_available').notNull().default(true),
  latencyMs: integer('latency_ms'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
});

export type TurnRow = typeof multiAgentTurns.$inferSelect;
export type ThreadRow = typeof chatThreads.$inferSelect;
export type VerifiedModelRow = typeof verifiedFreeModels.$inferSelect;
