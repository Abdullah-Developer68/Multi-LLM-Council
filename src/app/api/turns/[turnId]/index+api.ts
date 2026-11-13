import { eq } from 'drizzle-orm';

import { requireUser } from '../../../../server/auth/session';
import { db } from '../../../../server/db/client';
import { multiAgentTurns } from '../../../../server/db/schema';
import { json, param, readBody, route } from '../../../../server/http';
import { requireOwnedTurn, toCouncilTurn } from '../../../../server/turns';
import { voteSchema } from '../../../../server/validation';

/** Records which seat's answer the user preferred (or clears the vote). */
export const PATCH = route(async (request, params) => {
  const user = await requireUser(request);
  const turn = await requireOwnedTurn(param(params, 'turnId'), user.id);
  const { preferredAgentId } = await readBody(request, voteSchema);
  const [updated] = await db
    .update(multiAgentTurns)
    .set({ meta: { ...(turn.meta ?? {}), preferredAgentId } })
    .where(eq(multiAgentTurns.id, turn.id))
    .returning();
  return json({ turn: toCouncilTurn(updated) });
});
