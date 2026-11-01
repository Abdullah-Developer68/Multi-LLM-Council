import { loginSchema } from '../../../lib/validation';
import { db } from '../../../db';
import { appAccounts } from '../../../db/schema';
import { verifyPassword } from '../../../lib/auth/password';
import { createSession } from '../../../lib/auth/session';
import { verifyFreeModelsOnLogin } from '../../../lib/ai/model-registry';
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

    // Verify the free OpenRouter models on every successful login and persist
    // the result in PostgreSQL. Bounded so login stays snappy; deeper latency
    // probes continue in the background.
    const verificationStartedAt = Date.now();
    const verifiedModels = await verifyFreeModelsOnLogin(4500).catch((err) => {
      console.warn('Login model verification failed:', err?.message || err);
      return [];
    });
    const modelVerificationMs = Date.now() - verificationStartedAt;

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
      verifiedModels,
      modelsVerified: verifiedModels.length === 3,
      modelVerificationMs,
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
