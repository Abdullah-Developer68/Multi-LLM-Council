import { eq } from 'drizzle-orm';

import { verifyInBackground } from '../../../server/ai/registry';
import { hashPassword } from '../../../server/auth/password';
import { createSession, toUserAccount } from '../../../server/auth/session';
import { db } from '../../../server/db/client';
import { appAccounts } from '../../../server/db/schema';
import { HttpError, json, readBody, route } from '../../../server/http';
import { signUpSchema } from '../../../server/validation';

export const POST = route(async (request) => {
  const { email, password, fullName } = await readBody(request, signUpSchema);

  const [existing] = await db.select({ id: appAccounts.id }).from(appAccounts).where(eq(appAccounts.email, email)).limit(1);
  if (existing) throw new HttpError(409, 'An account with this email already exists. Try signing in.');

  const [account] = await db
    .insert(appAccounts)
    .values({ email, fullName, passwordHash: await hashPassword(password), createdAt: new Date() })
    .returning();

  const token = await createSession(account.id);
  verifyInBackground();
  return json({ token, user: toUserAccount(account) }, 201);
});
