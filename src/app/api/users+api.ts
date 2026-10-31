import { db } from '../../db';
import { users } from '../../db/schema';
import { createUserSchema } from '../../lib/validation';
import { extractBearerToken, validateSession } from '../../lib/auth/session';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await validateSession(token))) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const allUsers = await db.select().from(users);
    return Response.json(allUsers);
  } catch (error: any) {
    console.error('List users error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await validateSession(token))) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        fullName: parsed.data.fullName,
        phone: parsed.data.phone ?? null,
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error: any) {
    console.error('Create user error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
