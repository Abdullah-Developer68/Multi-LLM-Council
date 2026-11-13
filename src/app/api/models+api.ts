import { z } from 'zod';

import { getCouncilStatus, probeSeats, verifySeats } from '../../server/ai/registry';
import { requireUser } from '../../server/auth/session';
import { json, readBody, route } from '../../server/http';

/** Current seat models, availability and remaining free quota. */
export const GET = route(async (request) => {
  await requireUser(request);
  return json(await getCouncilStatus());
});

const actionSchema = z.object({ action: z.enum(['verify', 'probe']).default('verify') });

/** `verify` re-checks the live catalog (free); `probe` also measures latency (≤ 3 requests). */
export const POST = route(async (request) => {
  await requireUser(request);
  const { action } = await readBody(request, actionSchema);
  if (action === 'probe') await probeSeats();
  else await verifySeats();
  return json(await getCouncilStatus());
});
