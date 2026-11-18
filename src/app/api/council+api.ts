import { runCouncil } from '../../server/ai/council';
import { AbortedError } from '../../server/ai/rotation';
import { loadOwnedAttachments } from '../../server/attachments/store';
import { requireUser } from '../../server/auth/session';
import { readBody, route } from '../../server/http';
import { councilSchema } from '../../server/validation';
import type { CouncilEvent } from '../../shared/types';

/**
 * Runs a council turn and streams progress as NDJSON (one CouncilEvent per
 * line): seat starts, model rotations, answer tokens, and the final turn.
 */
export const POST = route(async (request) => {
  const user = await requireUser(request);
  const body = await readBody(request, councilSchema);
  const attachments = await loadOwnedAttachments(user.id, body.attachmentIds);
  const encoder = new TextEncoder();
  const abort = new AbortController();
  request.signal?.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (event: CouncilEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const turn = await runCouncil({
          user,
          prompt: body.prompt,
          threadId: body.threadId,
          useContext: body.useContext ?? true,
          attachments,
          signal: abort.signal,
          emit,
        });
        emit({ type: 'done', turn });
      } catch (err) {
        if (!(err instanceof AbortedError)) {
          console.error('[council] turn failed:', err);
          emit({ type: 'error', message: (err as Error).message || 'The council could not answer.' });
        }
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by a disconnect
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});
