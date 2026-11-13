/**
 * Curated free-model rotation pools per seat. These are the defaults; the
 * registry re-checks them against the live OpenRouter catalog and persists the
 * verified order to `verified_free_models`.
 *
 * `pollinations/*` entries are served by the keyless Pollinations endpoint,
 * which answers even when every OpenRouter key has used its daily quota.
 */

export const KEYLESS_PREFIX = 'pollinations/';

export function isKeyless(model: string): boolean {
  return model.startsWith(KEYLESS_PREFIX);
}

export const KEYLESS_LADDER = ['pollinations/openai', 'pollinations/openai-fast', 'pollinations/mistral'];

export const SEAT_POOLS: Record<string, string[]> = {
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

export function seatPool(seatId: string): string[] {
  return SEAT_POOLS[seatId] ?? SEAT_POOLS['nemotron-lightning'];
}

export function unique(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}
