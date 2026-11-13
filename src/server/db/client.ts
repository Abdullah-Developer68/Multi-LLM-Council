import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { readEnv } from '../env';
import * as schema from './schema';

/**
 * One postgres.js pool per server process. Kept on globalThis so Metro's
 * module reloads in development don't leak connections.
 */
const g = globalThis as unknown as { __traSql?: postgres.Sql };

function createClient(): postgres.Sql {
  const url = readEnv('DATABASE_URL');
  if (!url) {
    console.warn('[db] DATABASE_URL is not set — API routes that touch the database will fail.');
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(url);
  return postgres(url, {
    // The Supabase transaction pooler does not support prepared statements.
    prepare: false,
    ssl: isLocal ? false : 'require',
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
  });
}

export const sql = (g.__traSql ??= createClient());
export const db = drizzle(sql, { schema });
