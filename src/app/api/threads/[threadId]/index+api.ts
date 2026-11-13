import { eq } from 'drizzle-orm';

import { requireUser } from '../../../../server/auth/session';
import { db } from '../../../../server/db/client';
import { chatThreads } from '../../../../server/db/schema';
import { json, param, readBody, route } from '../../../../server/http';
import { requireOwnedThread, toThreadSummary } from '../../../../server/turns';
import { updateThreadSchema } from '../../../../server/validation';

export const PATCH = route(async (request, params) => {
  const user = await requireUser(request);
  const thread = await requireOwnedThread(param(params, 'threadId'), user.id);
  const changes = await readBody(request, updateThreadSchema);
  const [updated] = await db.update(chatThreads).set(changes).where(eq(chatThreads.id, thread.id)).returning();
  return json({ thread: toThreadSummary(updated) });
});

export const DELETE = route(async (request, params) => {
  const user = await requireUser(request);
  const thread = await requireOwnedThread(param(params, 'threadId'), user.id);
  await db.delete(chatThreads).where(eq(chatThreads.id, thread.id));
  return json({ ok: true });
});
