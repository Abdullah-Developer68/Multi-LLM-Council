import { extractBearerToken, revokeSession } from '../../../lib/auth/session';

export async function POST(request: Request) {
  try {
    let token = extractBearerToken(request);
    if (!token) {
      try {
        const body = await request.json();
        if (typeof body?.token === 'string') {
          token = body.token;
        }
      } catch {
        // no body
      }
    }

    if (token) {
      await revokeSession(token);
    }

    return Response.json({ success: true, message: 'Logged out successfully.' });
  } catch (error: any) {
    console.error('Logout error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
