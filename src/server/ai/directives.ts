/**
 * Seat prompt construction and context summarization helpers.
 */

import type { SeatDefinition } from '../../shared/council';
import type { ChatMessage } from './providers';

export interface ContextTurn {
  userPrompt: string;
  summary: string;
}

export interface PickedModelIdentity {
  name: string;
  companyName: string;
}

function isLegacySeat(target: SeatDefinition | PickedModelIdentity): target is SeatDefinition {
  return 'persona' in target && 'blurb' in target;
}

export function seatMessages(
  target: SeatDefinition | PickedModelIdentity,
  refinedPrompt: string,
  attachmentsBlock?: string,
): ChatMessage[] {
  const attachmentRule = attachmentsBlock
    ? '\nUse the attached files as your primary source, cite them by name, and say when something is not in them.'
    : '';
  const intro = isLegacySeat(target)
    ? `You are ${target.name}, the ${target.persona} on a three-model council. ${target.blurb}`
    : `You are ${target.name} by ${target.companyName}, one of several AI models answering the same question side by side.`;
  return [
    {
      role: 'system',
      content: `${intro}
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
