import { db } from '../../db';
import { appAccounts, appSessions } from '../../db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { generateSessionToken } from './password';

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(accountId: number): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(appSessions).values({
    token,
    accountId,
    createdAt: new Date(),
    expiresAt,
  });

  return token;
}

export async function validateSession(token: string) {
  if (!token) return null;

  const results = await db
    .select({
      session: appSessions,
      account: appAccounts,
    })
    .from(appSessions)
    .innerJoin(appAccounts, eq(appSessions.accountId, appAccounts.id))
    .where(
      and(
        eq(appSessions.token, token),
        gt(appSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (results.length === 0) return null;

  return {
    account: {
      id: results[0].account.id,
      email: results[0].account.email,
      fullName: results[0].account.fullName,
      createdAt: results[0].account.createdAt,
    },
    session: results[0].session,
  };
}

export async function revokeSession(token: string): Promise<boolean> {
  if (!token) return false;
  await db.delete(appSessions).where(eq(appSessions.token, token));
  return true;
}

export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}
