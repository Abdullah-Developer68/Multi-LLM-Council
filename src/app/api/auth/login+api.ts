import { eq } from 'drizzle-orm';

import { verifyInBackground } from '../../../server/ai/registry';
import { hashPassword, verifyPassword } from '../../../server/auth/password';
import { createSession, toUserAccount } from '../../../server/auth/session';
import { db } from '../../../server/db/client';
import { appAccounts } from '../../../server/db/schema';
import { HttpError, json, readBody, route } from '../../../server/http';
import { signInSchema } from '../../../server/validation';

const INVALID = 'That email and password combination is not right.';

export const POST = route(async (request) => {
  const { email, password } = await readBody(request, signInSchema);

  const [account] = await db.select().from(appAccounts).where(eq(appAccounts.email, email)).limit(1);
  if (!account) throw new HttpError(401, INVALID);

  const { valid, needsRehash } = await verifyPassword(password, account.passwordHash);
  if (!valid) throw new HttpError(401, INVALID);
  if (needsRehash) {
    await db.update(appAccounts).set({ passwordHash: await hashPassword(password) }).where(eq(appAccounts.id, account.id));
  }

  const token = await createSession(account.id);
  verifyInBackground();
  return json({ token, user: toUserAccount(account) });
});
