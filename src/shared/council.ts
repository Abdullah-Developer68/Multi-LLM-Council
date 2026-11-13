/**
 * The three council seats. Shared by client (labels, accents, ordering)
 * and server (orchestration, directives, model pools).
 */

export type ProviderKey = 'nvidia' | 'cohere' | 'google' | 'openai' | 'other';

export interface SeatDefinition {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  providerKey: ProviderKey;
  defaultModel: string;
  persona: string;
  blurb: string;
}

export const SEATS: SeatDefinition[] = [
  {
    id: 'nemotron-lightning',
    name: 'Nemotron 3.5 Lightning',
    shortName: 'Lightning',
    provider: 'NVIDIA',
    providerKey: 'nvidia',
    defaultModel: 'nvidia/nemotron-3.5-lightning:free',
    persona: 'Formal Reasoner',
    blurb: 'Deductive, step-by-step logic with explicit verification.',
  },
  {
    id: 'north-mini-code',
    name: 'Cohere North Mini',
    shortName: 'North',
    provider: 'Cohere',
    providerKey: 'cohere',
    defaultModel: 'cohere/north-mini-code:free',
    persona: 'Systems Architect',
    blurb: 'Implementation detail, code, edge cases and failure modes.',
  },
  {
    id: 'nemotron-ultra',
    name: 'Nemotron Ultra (550B)',
    shortName: 'Ultra',
    provider: 'NVIDIA',
    providerKey: 'nvidia',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    persona: 'Strategic Synthesizer',
    blurb: 'Trade-offs, second-order effects and the big picture.',
  },
];

export function getSeat(seatId: string): SeatDefinition | undefined {
  return SEATS.find((s) => s.id === seatId);
}

export function seatIndex(seatId: string): number {
  const i = SEATS.findIndex((s) => s.id === seatId);
  return i === -1 ? SEATS.length : i;
}

/** Best-effort provider detection from a model id (used for logos after rotation). */
export function providerFromModel(model: string | undefined): ProviderKey {
  const m = (model ?? '').toLowerCase();
  if (m.includes('nvidia') || m.includes('nemotron')) return 'nvidia';
  if (m.includes('cohere') || m.includes('north')) return 'cohere';
  if (m.includes('google') || m.includes('gemma') || m.includes('gemini')) return 'google';
  if (m.includes('openai') || m.includes('gpt') || m.startsWith('pollinations/')) return 'openai';
  return 'other';
}

/** Turns `nvidia/nemotron-3.5-lightning:free` into `nemotron-3.5-lightning`. */
export function shortModelName(model: string | undefined): string {
  if (!model) return 'unknown';
  const tail = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model;
  return tail.replace(/:free$/, '');
}

export const PROMPT_SUGGESTIONS = [
  'Design a rate limiter for a public API and explain the trade-offs',
  'What are the strongest arguments for and against a four-day work week?',
  'Explain how a B-tree index speeds up a SQL query, step by step',
  'Review this plan: migrate a monolith to microservices in one quarter',
];
