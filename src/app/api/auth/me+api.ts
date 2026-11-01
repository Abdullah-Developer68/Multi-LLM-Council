import { extractBearerToken, validateSession } from '../../../lib/auth/session';
import { verifyFreeModelsOnLogin } from '../../../lib/ai/model-registry';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return Response.json(
        { success: false, error: 'Unauthorized: missing authorization header' },
        { status: 401 }
      );
    }

    const sessionInfo = await validateSession(token);
    if (!sessionInfo) {
      return Response.json(
        { success: false, error: 'Unauthorized: session expired or invalid' },
        { status: 401 }
      );
    }

    // Session restore counts as a login: keep the verified free model
    // configuration in PostgreSQL fresh (bounded, probes continue in background).
    const verificationStartedAt = Date.now();
    const verifiedModels = await verifyFreeModelsOnLogin(4500).catch((err) => {
      console.warn('Session model verification failed:', err?.message || err);
      return [];
    });
    const modelVerificationMs = Date.now() - verificationStartedAt;

    return Response.json({
      success: true,
      user: sessionInfo.account,
      verifiedModels,
      modelsVerified: verifiedModels.length === 3,
      modelVerificationMs,
    });
  } catch (error: any) {
    console.error('Me endpoint error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
