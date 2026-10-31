import { db } from '../../../../db';
import { multiAgentTurns } from '../../../../db/schema';
import { asc, eq } from 'drizzle-orm';
import { extractBearerToken, validateSession } from '../../../../lib/auth/session';

export async function GET(
  request: Request,
  context?: { params?: Record<string, string | string[]> }
) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await validateSession(token))) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let threadId = context?.params?.threadId;
    if (!threadId) {
      // Fallback: extract from URL
      const pathname = new URL(request.url).pathname;
      const match = pathname.match(/\/threads\/([^/]+)\/messages/);
      if (match) threadId = match[1];
    }

    if (Array.isArray(threadId)) threadId = threadId[0];

    if (!threadId) {
      return Response.json({ error: 'Thread ID required' }, { status: 400 });
    }

    const turns = await db
      .select()
      .from(multiAgentTurns)
      .where(eq(multiAgentTurns.threadId, threadId))
      .orderBy(asc(multiAgentTurns.createdAt));

    // Map to client format
    const formatted = turns.map((t) => ({
      turnId: t.id,
      threadId: t.threadId,
      userPrompt: t.userPrompt,
      optimizedPrompt: t.optimizedPrompt,
      optimizationDetails: t.optimizationDetails,
      consensusSolution: t.consensusSolution,
      consensusRationale: t.consensusRationale,
      agentResponses: t.agentResponses,
      discussionRounds: t.discussionRounds,
      rankedAgentIds: t.rankedAgentIds,
      createdAt: t.createdAt.toISOString(),
    }));

    return Response.json(formatted);
  } catch (error: any) {
    console.error('List thread turns error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
