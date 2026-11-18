import { eq } from 'drizzle-orm';

import { REFINER, SEATS } from '../../shared/council';
import type { CouncilEvent, CouncilTurn, SeatResponse, UserAccount } from '../../shared/types';
import { buildAttachmentsBlock, loadOwnedAttachments, toAttachmentMeta } from '../attachments/store';
import { db } from '../db/client';
import { chatThreads, multiAgentTurns, type AttachmentRow } from '../db/schema';
import { listThreadTurns, newId, requireOwnedThread, titleFromPrompt, toCouncilTurn } from '../turns';
import { seatMessages, summarize, type ContextTurn } from './directives';
import { refinePrompt } from './refiner';
import { AbortedError, primaryModelFor, runSeat } from './rotation';

const CONTEXT_TURNS = 3;

export interface CouncilRequest {
  user: UserAccount;
  prompt: string;
  threadId?: string;
  useContext: boolean;
  attachmentIds?: string[];
  attachments?: AttachmentRow[];
  signal?: AbortSignal;
  emit: (event: CouncilEvent) => void;
}

async function loadContext(threadId: string): Promise<ContextTurn[]> {
  const rows = await listThreadTurns(threadId);
  return rows.slice(-CONTEXT_TURNS).map((row) => {
    const turn = toCouncilTurn(row);
    const best =
      turn.synthesis?.text ??
      turn.agentResponses.find((r) => r.agentId === turn.preferredAgentId && r.status === 'ok')?.answer ??
      turn.agentResponses.find((r) => r.status === 'ok')?.answer ??
      '';
    return { userPrompt: turn.userPrompt, summary: summarize(best) };
  });
}

/**
 * Runs one council turn: the Prompt Refiner rewrites the prompt once, then all
 * three seats answer concurrently from that refined prompt. Tokens stream out
 * as events; the turn is persisted once at least one seat has answered.
 */
export async function runCouncil(req: CouncilRequest): Promise<CouncilTurn> {
  const started = Date.now();
  const { user, prompt, emit, signal } = req;

  const attachments = req.attachments ?? (await loadOwnedAttachments(user.id, req.attachmentIds));
  const attachmentMetas = attachments.map(toAttachmentMeta);
  const attachmentsBlock = buildAttachmentsBlock(attachments);

  const existing = req.threadId ? await requireOwnedThread(req.threadId, user.id) : null;
  const threadId = existing?.id ?? newId('thread');
  const title = existing?.title ?? titleFromPrompt(prompt);
  emit({ type: 'thread', threadId, title, created: !existing });

  const context = existing && req.useContext ? await loadContext(existing.id) : [];

  emit({ type: 'refine:start', model: await primaryModelFor(REFINER.id) });
  const refinement = await refinePrompt({ prompt, context, attachments, signal });
  emit({ type: 'refine:done', refinement });

  const responses = await Promise.all(
    SEATS.map(async (seat): Promise<SeatResponse> => {
      const base = {
        agentId: seat.id,
        agentName: seat.name,
        receivedPrompt: refinement.prompt,
      };

      const primary = await primaryModelFor(seat.id);
      emit({
        type: 'seat:start',
        seatId: seat.id,
        model: primary,
      });

      let response: SeatResponse;
      try {
        const result = await runSeat({
          seatId: seat.id,
          seatName: seat.name,
          messages: seatMessages(seat, refinement.prompt, attachmentsBlock),
          signal,
          onEvent: (event) => {
            if (event.type === 'delta') emit({ type: 'seat:delta', seatId: seat.id, text: event.text });
            else if (event.type === 'reset') emit({ type: 'seat:reset', seatId: seat.id });
            else if (event.type === 'thinking') emit({ type: 'seat:thinking', seatId: seat.id });
            else emit({ type: 'seat:rotate', seatId: seat.id, model: event.model, reason: event.reason });
          },
        });
        response = {
          ...base,
          model: result.model,
          answer: result.text,
          status: 'ok',
          latencyMs: result.latencyMs,
          tier: result.tier,
          rotated: result.rotated,
          attempts: result.attempts,
        };
      } catch (err) {
        if (err instanceof AbortedError) throw err;
        response = {
          ...base,
          model: primary,
          answer: '',
          status: 'error',
          error: (err as Error).message,
        };
      }
      emit({ type: 'seat:done', seatId: seat.id, response });
      return response;
    }),
  );

  if (responses.every((r) => r.status === 'error')) {
    throw new Error(responses[0]?.error ?? 'No council seat could answer right now. Please try again shortly.');
  }

  const now = new Date();
  if (existing) {
    await db.update(chatThreads).set({ updatedAt: now }).where(eq(chatThreads.id, threadId));
  } else {
    await db.insert(chatThreads).values({ id: threadId, title, accountId: user.id, createdAt: now, updatedAt: now });
  }

  const [row] = await db
    .insert(multiAgentTurns)
    .values({
      id: newId('turn'),
      threadId,
      userPrompt: prompt,
      optimizedPrompt: refinement.prompt,
      optimizationDetails: {
        model: refinement.model,
        latencyMs: refinement.latencyMs,
        refined: refinement.refined,
        ...(refinement.error ? { error: refinement.error } : {}),
      },
      consensusSolution: '',
      agentResponses: responses,
      rankedAgentIds: SEATS.map((s) => s.id),
      meta: {
        elapsedMs: Date.now() - started,
        contextTurns: context.length,
        preferredAgentId: null,
        synthesis: null,
        ...(attachmentMetas.length ? { attachments: attachmentMetas } : {}),
      },
      createdAt: now,
    })
    .returning();

  return toCouncilTurn(row);
}
