import { eq } from 'drizzle-orm';

import { requireUser, toUserAccount } from '../../../server/auth/session';
import { db } from '../../../server/db/client';
import { appAccounts } from '../../../server/db/schema';
import { json, readBody, route } from '../../../server/http';
import { updateProfileSchema } from '../../../server/validation';

export const GET = route(async (request) => {
  return json({ user: await requireUser(request) });
});

export const PATCH = route(async (request) => {
  const user = await requireUser(request);
  const { fullName } = await readBody(request, updateProfileSchema);
  const [updated] = await db.update(appAccounts).set({ fullName }).where(eq(appAccounts.id, user.id)).returning();
  return json({ user: toUserAccount(updated) });
});
