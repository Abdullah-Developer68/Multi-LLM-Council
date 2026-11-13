import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { requireUser } from '../../../server/auth/session';
import { db } from '../../../server/db/client';
import { chatThreads } from '../../../server/db/schema';
import { json, route } from '../../../server/http';
import { toThreadSummary } from '../../../server/turns';

/** Lists the signed-in user's conversations. `?q=` searches titles and prompts. */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const q = new URL(request.url).searchParams.get('q')?.trim();

  // Correlated subqueries use explicit aliases: Drizzle renders bare column names,
  // which would otherwise resolve to the inner table's `id`.
  const turnCount = sql<number>`(select count(*)::int from multi_agent_turns m where m.thread_id = "chat_threads"."id")`;
  const owned = eq(chatThreads.accountId, user.id);
  const pattern = q ? `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const where = pattern
    ? and(
        owned,
        or(
          ilike(chatThreads.title, pattern),
          sql`exists (select 1 from multi_agent_turns m where m.thread_id = "chat_threads"."id" and m.user_prompt ilike ${pattern})`,
        ),
      )
    : owned;

  const rows = await db
    .select({ thread: chatThreads, turnCount })
    .from(chatThreads)
    .where(where)
    .orderBy(desc(chatThreads.pinned), desc(chatThreads.updatedAt))
    .limit(100);

  return json({ threads: rows.map((r) => toThreadSummary(r.thread, r.turnCount)) });
});
