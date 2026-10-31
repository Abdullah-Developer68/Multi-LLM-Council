import { multiAgentPromptSchema } from '../../lib/validation';
import { runMultiAgentPipeline } from '../../lib/ai/orchestrator';
import { extractBearerToken, validateSession } from '../../lib/auth/session';

export async function POST(request: Request) {
  try {
    const token = extractBearerToken(request);
    if (!token || !(await validateSession(token))) {
      return Response.json({ success: false, error: 'Unauthorized: Please log in first.' }, { status: 401 });
    }

    const headerKey = request.headers.get('x-openrouter-key');
    const body = await request.json();
    const parsed = multiAgentPromptSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const apiKey = parsed.data.apiKey || headerKey || undefined;
    const result = await runMultiAgentPipeline(
      parsed.data.prompt,
      parsed.data.threadId,
      apiKey
    );

    return Response.json(result);
  } catch (error: any) {
    console.error('Multi-agent pipeline error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Failed to process multi-agent turn.' },
      { status: 500 }
    );
  }
}
