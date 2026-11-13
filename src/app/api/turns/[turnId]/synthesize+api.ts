import { eq } from 'drizzle-orm';

import { synthesize } from '../../../../server/ai/synthesis';
import { requireUser } from '../../../../server/auth/session';
import { db } from '../../../../server/db/client';
import { multiAgentTurns } from '../../../../server/db/schema';
import { HttpError, json, param, route } from '../../../../server/http';
import { requireOwnedTurn, toCouncilTurn } from '../../../../server/turns';

/** Builds (or rebuilds) the council consensus for one turn. */
export const POST = route(async (request, params) => {
  const user = await requireUser(request);
  const row = await requireOwnedTurn(param(params, 'turnId'), user.id);

  let synthesis;
  try {
    synthesis = await synthesize(toCouncilTurn(row), request.signal);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, (err as Error).message || 'The council chair could not answer right now.');
  }

  const [updated] = await db
    .update(multiAgentTurns)
    .set({ consensusSolution: synthesis.text, meta: { ...(row.meta ?? {}), synthesis } })
    .where(eq(multiAgentTurns.id, row.id))
    .returning();
  return json({ turn: toCouncilTurn(updated) });
});
