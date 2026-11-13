/**
 * Peer-ring directives.
 *
 * Each seat writes an execution directive for the next seat in the ring
 * (0 → 1 → 2 → 0). Directives are built deterministically from the
 * author's methodology so no quota is spent before the council answers.
 */

import { SEATS, type SeatDefinition } from '../../shared/council';
import type { ChatMessage } from './providers';

export interface ContextTurn {
  userPrompt: string;
  summary: string;
}

/** The methodology each seat brings when it writes a directive for its peer. */
const METHODOLOGY: Record<string, { role: string; protocol: string[] }> = {
  'nemotron-lightning': {
    role: 'Senior Formal Reasoner & Logic Auditor',
    protocol: [
      'Establish definitions, assumptions and initial conditions.',
      'Reason step by step; make every inference explicit.',
      'Test the conclusion against counterexamples and boundary cases.',
      'Deliver a definitive, verifiable conclusion.',
    ],
  },
  'north-mini-code': {
    role: 'Lead Systems Architect & Code Engineer',
    protocol: [
      'Turn the request into concrete requirements and components.',
      'Address data structures, complexity and state where relevant.',
      'Enumerate edge cases, failure modes and input validation.',
      'Give production-grade examples or code where they help.',
    ],
  },
  'nemotron-ultra': {
    role: 'Strategic Synthesizer & Systems Thinker',
    protocol: [
      'Map the context, the core trade-offs and hidden assumptions.',
      'Compare options against explicit criteria.',
      'Consider second-order effects and long-term risks.',
      'Close with an actionable recommendation.',
    ],
  },
};

export function peerOf(seatIndex: number): SeatDefinition {
  return SEATS[(seatIndex - 1 + SEATS.length) % SEATS.length];
}

function contextBlock(context: ContextTurn[]): string {
  if (!context.length) return '';
  const items = context
    .map((t, i) => `[${i + 1}] User: ${t.userPrompt}\n    Council: ${t.summary}`)
    .join('\n');
  return `\n<conversation_so_far>\n${items}\n</conversation_so_far>\n`;
}

export function buildDirective(author: SeatDefinition, prompt: string, context: ContextTurn[]): string {
  const method = METHODOLOGY[author.id] ?? METHODOLOGY['nemotron-lightning'];
  return `### DIRECTIVE — prepared by ${author.name}
<role>${method.role}</role>
${contextBlock(context)}
<user_task>
${prompt.trim()}
</user_task>

<protocol>
${method.protocol.map((step, i) => `${i + 1}. ${step}`).join('\n')}
</protocol>

<constraints>
- State unavoidable assumptions instead of inventing facts.
- Use clean Markdown: short headings, lists, fenced code with language tags.
- Be information-dense. No filler, no restating the task.
</constraints>`;
}

export function seatMessages(seat: SeatDefinition, author: SeatDefinition, directive: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are ${seat.name}, the ${seat.persona} on a three-model council. ${seat.blurb}
Your peer ${author.name} prepared the directive below for you. Follow its role, protocol and constraints.
Answer directly. Do not repeat the directive or its tags, and do not narrate your thinking.
Keep it under ~450 words unless the task genuinely needs more detail or code.`,
    },
    { role: 'user', content: directive },
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
