/**
 * Static, curated free-model rotation pools per council seat.
 *
 * These are only the *defaults*. On every login the live OpenRouter catalog is
 * re-verified and the winning configuration is persisted to PostgreSQL
 * (`verified_free_models`). `executeWithFreeModelRotation` prefers the
 * DB-persisted configuration and only uses these pools as a last-resort
 * bootstrap when the database has not been verified yet.
 *
 * Each pool ends with a keyless `pollinations/*` candidate. Pollinations exposes
 * an OpenAI-compatible endpoint that needs no API key, so a seat can always
 * answer even when every OpenRouter key has burned its 50/day free quota.
 */

/** Prefix that marks a candidate as the keyless Pollinations tier. */
export const KEYLESS_MODEL_PREFIX = 'pollinations/';

/** True when a model id belongs to the keyless (no API key) fallback tier. */
export function isKeylessModel(modelId: string | undefined | null): boolean {
  return !!modelId && modelId.startsWith(KEYLESS_MODEL_PREFIX);
}

/**
 * Keyless candidates tried, in order, after every OpenRouter key has failed.
 * Pollinations' classic endpoint currently serves `openai-fast` (aliases
 * `openai`, `gpt-oss`, `gpt-oss-20b`); unknown ids are retried against it.
 */
export const KEYLESS_FALLBACK_MODELS: string[] = [
  'pollinations/openai',
  'pollinations/openai-fast',
  'pollinations/mistral',
];

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
    'pollinations/openai',
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
    'pollinations/qwen-coder',
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
    'pollinations/mistral',
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
