import { and, eq, gt } from 'drizzle-orm';

import type { UserAccount } from '../../shared/types';
import { db } from '../db/client';
import { appAccounts, appSessions } from '../db/schema';
import { HttpError } from '../http';
import { generateToken } from './password';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function toUserAccount(row: {
  id: number;
  email: string;
  fullName: string;
  createdAt: Date | null;
}): UserAccount {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
  };
}

export async function createSession(accountId: number): Promise<string> {
  const token = generateToken();
  await db.insert(appSessions).values({
    token,
    accountId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function findSession(token: string) {
  const [row] = await db
    .select({ account: appAccounts })
    .from(appSessions)
    .innerJoin(appAccounts, eq(appSessions.accountId, appAccounts.id))
    .where(and(eq(appSessions.token, token), gt(appSessions.expiresAt, new Date())))
    .limit(1);
  return row ? toUserAccount(row.account) : null;
}

/** Resolves the signed-in account or throws 401. */
export async function requireUser(request: Request): Promise<UserAccount> {
  const token = extractBearerToken(request);
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  const user = await findSession(token);
  if (!user) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return user;
}

export async function revokeSession(token: string): Promise<void> {
  await db.delete(appSessions).where(eq(appSessions.token, token));
}

export async function revokeAllSessions(accountId: number): Promise<void> {
  await db.delete(appSessions).where(eq(appSessions.accountId, accountId));
}
