import { extractBearerToken, validateSession } from '../../../lib/auth/session';

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

    return Response.json({
      success: true,
      user: sessionInfo.account,
    });
  } catch (error: any) {
    console.error('Me endpoint error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
