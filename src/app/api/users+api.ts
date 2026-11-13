import { db } from '../../server/db/client';
import { users } from '../../server/db/schema';
import { requireUser } from '../../server/auth/session';
import { json, readBody, route } from '../../server/http';
import { createUserSchema } from '../../server/validation';

/** Legacy v1 directory endpoints, kept for compatibility. */
export const GET = route(async (request) => {
  await requireUser(request);
  return json(await db.select().from(users));
});

export const POST = route(async (request) => {
  await requireUser(request);
  const body = await readBody(request, createUserSchema);
  const [created] = await db
    .insert(users)
    .values({ fullName: body.fullName, phone: body.phone ?? null })
    .returning();
  return json(created, 201);
});
