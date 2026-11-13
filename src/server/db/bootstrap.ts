import { sql } from './client';

/**
 * Idempotent, additive schema bootstrap.
 *
 * Creates any missing table and adds the columns v2 introduced, so the app
 * works against both a fresh database and the v1 database without a manual
 * migration. Nothing here drops or rewrites existing data.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    full_name text,
    phone varchar(256)
  )`,
  `CREATE TABLE IF NOT EXISTS app_accounts (
    id serial PRIMARY KEY,
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    id serial PRIMARY KEY,
    token text NOT NULL UNIQUE,
    account_id integer NOT NULL REFERENCES app_accounts(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    expires_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id text PRIMARY KEY,
    title text NOT NULL DEFAULT 'Multi-Agent Deliberation',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS account_id integer REFERENCES app_accounts(id) ON DELETE CASCADE`,
  `ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS chat_threads_account_idx ON chat_threads (account_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS multi_agent_turns (
    id text PRIMARY KEY,
    thread_id text NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    user_prompt text NOT NULL,
    optimized_prompt text NOT NULL,
    optimization_details jsonb,
    consensus_solution text NOT NULL,
    consensus_rationale text,
    agent_responses jsonb NOT NULL,
    discussion_rounds jsonb,
    ranked_agent_ids jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE multi_agent_turns ADD COLUMN IF NOT EXISTS meta jsonb`,
  `CREATE INDEX IF NOT EXISTS multi_agent_turns_thread_idx ON multi_agent_turns (thread_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS verified_free_models (
    seat_id text PRIMARY KEY,
    agent_name text NOT NULL,
    primary_model text NOT NULL,
    fallback_models jsonb NOT NULL,
    provider text NOT NULL,
    is_free boolean NOT NULL DEFAULT true,
    is_available boolean NOT NULL DEFAULT true,
    latency_ms integer,
    verified_at timestamptz NOT NULL DEFAULT now()
  )`,
];

const g = globalThis as unknown as { __traSchemaReady?: Promise<void> };

async function run(): Promise<void> {
  for (const statement of STATEMENTS) {
    await sql.unsafe(statement);
  }
}

/** Resolves once the schema is in place. Runs at most once per server process. */
export function ensureSchema(): Promise<void> {
  if (!g.__traSchemaReady) {
    g.__traSchemaReady = run().catch((err) => {
      g.__traSchemaReady = undefined;
      throw err;
    });
  }
  return g.__traSchemaReady;
}
