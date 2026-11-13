import { extractBearerToken, findSession, revokeAllSessions, revokeSession } from '../../../server/auth/session';
import { json, readBody, route } from '../../../server/http';
import { logoutSchema } from '../../../server/validation';

export const POST = route(async (request) => {
  const token = extractBearerToken(request);
  const { everywhere } = await readBody(request, logoutSchema);
  if (token) {
    const user = everywhere ? await findSession(token) : null;
    if (user) await revokeAllSessions(user.id);
    else await revokeSession(token);
  }
  return json({ ok: true });
});
