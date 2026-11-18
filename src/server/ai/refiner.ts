/**
 * Prompt Refiner: runs the 4th model (`REFINER`) ahead of the council seats
 * to turn the user's raw prompt (+ recent thread context) into one clear,
 * self-contained prompt shared by all three seats.
 */

import { REFINER } from '../../shared/council';
import type { TurnRefinement } from '../../shared/types';
import { buildAttachmentsPreview } from '../attachments/store';
import type { AttachmentRow } from '../db/schema';
import type { ContextTurn } from './directives';
import { AbortedError, primaryModelFor, runSeat } from './rotation';
import { loadSkill } from './skills';

const REFINE_BUDGET_MS = 25_000;

function formatContext(context: ContextTurn[]): string {
  if (!context.length) return '';
  const items = context
    .map((t, i) => `[${i + 1}] User: ${t.userPrompt}\n    Council: ${t.summary}`)
    .join('\n');
  return `\n<conversation_so_far>\n${items}\n</conversation_so_far>\n`;
}

function stripOuterFence(text: string): string {
  return text.replace(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n?```$/g, '$1').trim();
}

function extractRefinedPrompt(raw: string): string {
  let text = stripOuterFence(raw.trim());
  const tagged = text.match(/<refined_prompt>([\s\S]*?)<\/refined_prompt>/i)?.[1];
  if (tagged !== undefined) {
    text = stripOuterFence(tagged.trim());
  }
  return text;
}

export async function refinePrompt(opts: {
  prompt: string;
  context: ContextTurn[];
  attachments?: AttachmentRow[];
  signal?: AbortSignal;
}): Promise<TurnRefinement> {
  const started = Date.now();
  const trimmedPrompt = opts.prompt.trim();
  const contextText = formatContext(opts.context);
  const attachmentsPreview = opts.attachments?.length ? buildAttachmentsPreview(opts.attachments) : '';
  const fallbackPrompt = contextText ? `${contextText.trim()}\n\n${trimmedPrompt}` : trimmedPrompt;

  if (opts.signal?.aborted) {
    throw new AbortedError();
  }

  const timeoutSignal = AbortSignal.timeout(REFINE_BUDGET_MS);
  const combinedSignal = opts.signal ? AbortSignal.any([opts.signal, timeoutSignal]) : timeoutSignal;

  let fallbackModel = REFINER.defaultModel;
  try {
    fallbackModel = await primaryModelFor(REFINER.id);
    const system = loadSkill('prompt-refiner');
    const user = [
      contextText.trim(),
      attachmentsPreview,
      `<user_prompt>\n${trimmedPrompt}\n</user_prompt>`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const result = await runSeat({
      seatId: REFINER.id,
      seatName: REFINER.name,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: 1200,
      temperature: 0.3,
      signal: combinedSignal,
    });

    const refined = extractRefinedPrompt(result.text);
    if (!refined) {
      return {
        prompt: fallbackPrompt,
        model: result.model,
        latencyMs: result.latencyMs,
        refined: false,
        error: 'Prompt refiner returned an empty response.',
      };
    }

    return {
      prompt: refined,
      model: result.model,
      latencyMs: result.latencyMs,
      refined: true,
    };
  } catch (err) {
    if (opts.signal?.aborted) {
      throw err instanceof AbortedError ? err : new AbortedError();
    }
    const message =
      err instanceof AbortedError || timeoutSignal.aborted
        ? 'Prompt refiner timed out.'
        : (err as Error)?.message || 'Prompt refiner failed.';
    return {
      prompt: fallbackPrompt,
      model: fallbackModel,
      latencyMs: Date.now() - started,
      refined: false,
      error: message,
    };
  }
}
