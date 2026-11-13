import { requireUser } from '../../../../server/auth/session';
import { json, param, route } from '../../../../server/http';
import { listThreadTurns, requireOwnedThread, toCouncilTurn, toThreadSummary } from '../../../../server/turns';

export const GET = route(async (request, params) => {
  const user = await requireUser(request);
  const thread = await requireOwnedThread(param(params, 'threadId'), user.id);
  const rows = await listThreadTurns(thread.id);
  return json({ thread: toThreadSummary(thread, rows.length), turns: rows.map(toCouncilTurn) });
});
