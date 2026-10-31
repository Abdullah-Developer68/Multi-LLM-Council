import { signUpSchema } from '../../../lib/validation';
import { db } from '../../../db';
import { appAccounts } from '../../../db/schema';
import { hashPassword } from '../../../lib/auth/password';
import { createSession } from '../../../lib/auth/session';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = signUpSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { email, password, fullName } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check if account already exists
    const existing = await db
      .select({ id: appAccounts.id })
      .from(appAccounts)
      .where(eq(appAccounts.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return Response.json(
        { success: false, error: 'An account with this email already exists.' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const [inserted] = await db
      .insert(appAccounts)
      .values({
        email: normalizedEmail,
        passwordHash,
        fullName: fullName.trim(),
        createdAt: new Date(),
      })
      .returning({
        id: appAccounts.id,
        email: appAccounts.email,
        fullName: appAccounts.fullName,
        createdAt: appAccounts.createdAt,
      });

    const token = await createSession(inserted.id);

    return Response.json(
      {
        success: true,
        token,
        user: inserted,
        message: 'Account created successfully.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Signup error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
