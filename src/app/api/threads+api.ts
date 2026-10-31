import { db } from '../../db';
import { chatThreads } from '../../db/schema';
import { createThreadSchema } from '../../lib/validation';
import { desc } from 'drizzle-orm';
import { extractBearerToken, validateSession } from '../../lib/auth/session';

export async function GET(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await validateSession(token))) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const threads = await db
      .select()
      .from(chatThreads)
      .orderBy(desc(chatThreads.updatedAt))
      .limit(50);

    return Response.json(threads);
  } catch (error: any) {
    console.error('List threads error:', error);
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

    let title = 'Multi-Agent Deliberation';
    try {
      const body = await request.json();
      const parsed = createThreadSchema.safeParse(body);
      if (parsed.success && parsed.data.title) {
        title = parsed.data.title;
      }
    } catch {
      // default title
    }

    const threadId = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const [created] = await db
      .insert(chatThreads)
      .values({
        id: threadId,
        title,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return Response.json(created, { status: 201 });
  } catch (error: any) {
    console.error('Create thread error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
