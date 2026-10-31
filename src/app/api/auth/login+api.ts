import { loginSchema } from '../../../lib/validation';
import { db } from '../../../db';
import { appAccounts } from '../../../db/schema';
import { verifyPassword } from '../../../lib/auth/password';
import { createSession } from '../../../lib/auth/session';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const [account] = await db
      .select()
      .from(appAccounts)
      .where(eq(appAccounts.email, normalizedEmail))
      .limit(1);

    if (!account) {
      return Response.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, account.passwordHash);
    if (!isValid) {
      return Response.json(
        { success: false, error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const token = await createSession(account.id);

    return Response.json({
      success: true,
      token,
      user: {
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        createdAt: account.createdAt,
      },
      message: 'Logged in successfully.',
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
