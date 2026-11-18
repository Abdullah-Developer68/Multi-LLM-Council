/**
 * Seat prompt construction and context summarization helpers.
 */

import type { SeatDefinition } from '../../shared/council';
import type { ChatMessage } from './providers';

export interface ContextTurn {
  userPrompt: string;
  summary: string;
}

export function seatMessages(
  seat: SeatDefinition,
  refinedPrompt: string,
  attachmentsBlock?: string,
): ChatMessage[] {
  const attachmentRule = attachmentsBlock
    ? '\nUse the attached files as your primary source, cite them by name, and say when something is not in them.'
    : '';
  return [
    {
      role: 'system',
      content: `You are ${seat.name}, the ${seat.persona} on a three-model council. ${seat.blurb}
Answer the task directly. Do not narrate your thinking, and do not mention that the prompt was refined.
Keep it under ~450 words unless the task genuinely needs more detail or code.${attachmentRule}`,
    },
    { role: 'user', content: attachmentsBlock ? `${refinedPrompt}\n\n${attachmentsBlock}` : refinedPrompt },
  ];
}

/** Collapses an answer into a short context line for later turns. */
export function summarize(text: string, max = 420): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/[#>*_`|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
