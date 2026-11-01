/**
 * Static, curated free-model rotation pools per council seat.
 *
 * These are only the *defaults*. On every login the live OpenRouter catalog is
 * re-verified and the winning configuration is persisted to PostgreSQL
 * (`verified_free_models`). `executeWithFreeModelRotation` prefers the
 * DB-persisted configuration and only uses these pools as a last-resort
 * bootstrap when the database has not been verified yet.
 */

export const SEAT_ROTATION_POOLS: Record<string, string[]> = {
  // Seat 1: NVIDIA Formal Reasoner
  'nemotron-lightning': [
    'nvidia/nemotron-3.5-lightning:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'google/gemma-4-31b-it:free',
    'thinkingmachines/inkling-small:free',
    'openrouter/free',
    'liquid/lfm-2.5-2.6b:free',
  ],
  // Seat 2: Cohere Systems Architect & Code
  'north-mini-code': [
    'cohere/north-mini-code:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'google/gemma-4-26b-a4b-it:free',
    'recursive/flint-v1.0:free',
    'xingchen-agi/xing4.0-29b-a4b:free',
    'openrouter/free',
    'liquid/lfm-2.5-2.6b:free',
  ],
  // Seat 3: NVIDIA Ultra Strategic Synthesizer
  'nemotron-ultra': [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'thinkingmachines/inkling:free',
    'google/gemma-4-31b-it:free',
    'openrouter/free',
    'nvidia/nemotron-3.5-lightning:free',
    'liquid/lfm-2.5-2.6b:free',
  ],
};

/** Resolve the static candidate pool for an agent/seat id (never throws). */
export function getSeatPool(agentId: string): string[] {
  return (
    SEAT_ROTATION_POOLS[agentId] ||
    (agentId.includes('north') || agentId.includes('cohere')
      ? SEAT_ROTATION_POOLS['north-mini-code']
      : agentId.includes('ultra')
        ? SEAT_ROTATION_POOLS['nemotron-ultra']
        : SEAT_ROTATION_POOLS['nemotron-lightning'])
  );
}
