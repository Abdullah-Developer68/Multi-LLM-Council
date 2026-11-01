/**
 * Free Model Rotation & Automatic Fallback Engine
 *
 * Guarantees that every council seat returns a real AI answer. Failover happens
 * on two axes:
 *
 * 1. **Model axis** — a single `:free` model can be queued, rate-limited or
 *    briefly down, so we walk the seat's verified candidate pool.
 * 2. **Key axis** — OpenRouter caps free models at 50 requests/day *per key*.
 *    When a key reports `free-models-per-day`, we mark that key exhausted and
 *    immediately retry the same candidate on the next configured key.
 * 3. **Provider axis** — if every OpenRouter key is exhausted (or every free
 *    model fails), we fall back to the keyless Pollinations tier
 *    (`https://text.pollinations.ai/openai`), which needs no API key at all.
 *
 * The candidate pool for each council seat comes from PostgreSQL
 * (`verified_free_models`, refreshed on every login by `model-registry.ts`), with
 * the static curated pools used only as a bootstrap fallback.
 */

import { getOpenRouterApiKeys } from './env';
import { getConfiguredModelsFromDb } from './model-registry';
import {
  KEYLESS_FALLBACK_MODELS,
  KEYLESS_MODEL_PREFIX,
  SEAT_ROTATION_POOLS,
  getSeatPool,
  isKeylessModel,
} from './seat-pools';
import {
  areAllApiKeysQuotaExhausted,
  clearApiKeyQuotaExhaustion,
  clearFreeQuotaExhaustion,
  clearModelCooldown,
  describeFreeQuotaExhaustion,
  FreeQuotaExhaustedError,
  getFreeQuotaResetAt,
  getModelRotationStatus,
  isApiKeyQuotaExhausted,
  isDailyFreeQuotaError,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  isModelInCooldown,
  markApiKeyQuotaExhausted,
  markFreeQuotaExhausted,
  markModelCooldown,
  parseRateLimitResetMs,
} from './model-cooldown';

export {
  KEYLESS_FALLBACK_MODELS,
  KEYLESS_MODEL_PREFIX,
  SEAT_ROTATION_POOLS,
  isKeylessModel,
};
export {
  areAllApiKeysQuotaExhausted,
  clearApiKeyQuotaExhaustion,
  clearFreeQuotaExhaustion,
  clearModelCooldown,
  describeFreeQuotaExhaustion,
  FreeQuotaExhaustedError,
  getFreeQuotaResetAt,
  getModelRotationStatus,
  isApiKeyQuotaExhausted,
  isDailyFreeQuotaError,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  isModelInCooldown,
  markApiKeyQuotaExhausted,
  markFreeQuotaExhausted,
  markModelCooldown,
};
export type { ExhaustedKeyInfo, ModelCooldownInfo } from './model-cooldown';

/** Default generation budget per candidate — fast answers, fast failover. */
export const DEFAULT_MAX_TOKENS = 1200;
export const DEFAULT_TIMEOUT_MS = 20000;

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_REFERER = 'http://localhost:8081';
const OPENROUTER_TITLE = 'TRA Multi-Agent Council';

/** Zero-key, OpenAI-compatible free tier (no API key, no daily per-key cap). */
const POLLINATIONS_CHAT_URL = 'https://text.pollinations.ai/openai';
/** The classic Pollinations endpoint currently serves this model id. */
const POLLINATIONS_DEFAULT_MODEL = 'openai-fast';

/** Keep this much of the budget free so the keyless tier can always answer. */
const KEYLESS_RESERVE_MS = 12_000;
/** Don't start an OpenRouter attempt with less than this much time left. */
const MIN_ATTEMPT_MS = 4_000;

export interface RotationOptions {
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
  /** Hard wall-clock budget for the whole seat (OpenRouter attempts + keyless). */
  totalBudgetMs?: number;
}

export interface RotationResult {
  text: string;
  modelUsed: string;
  wasRotated: boolean;
  latencyMs: number;
  /** Which provider actually served the answer. */
  tier: 'openrouter' | 'keyless';
}

type AttemptOutcome =
  | { ok: true; text: string; latencyMs: number }
  | { ok: false; kind: 'daily_quota'; message: string; resetAt?: number }
  | { ok: false; kind: 'key_error'; message: string }
  | { ok: false; kind: 'rate_limit'; message: string }
  | { ok: false; kind: 'unknown_model'; message: string }
  | { ok: false; kind: 'empty'; message: string }
  | { ok: false; kind: 'error'; message: string };

function unique(values: (string | undefined | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && v.length > 0)));
}

/**
 * Builds the ordered candidate list for a seat: DB-verified primary first, then
 * its verified fallbacks, then the static curated pool as a last resort. Keyless
 * `pollinations/*` candidates are always appended last.
 */
async function resolveCandidatePool(
  agentId: string
): Promise<{ primaryModel: string; pool: string[]; openRouterCandidates: string[]; keylessCandidates: string[] }> {
  const staticPool = getSeatPool(agentId);
  let ordered = staticPool;

  try {
    const configs = await getConfiguredModelsFromDb();
    const seat = configs.find((c) => c.seatId === agentId);
    if (seat?.primaryModel) {
      ordered = unique([seat.primaryModel, ...(seat.fallbackModels || []), ...staticPool]);
    }
  } catch (err: any) {
    console.warn('[ModelRotation] Falling back to static seat pool:', err?.message || err);
  }

  const openRouterCandidates = ordered.filter((m) => !isKeylessModel(m));
  // Seat-specific keyless candidate first, then the shared keyless ladder.
  const keylessCandidates = unique([
    ...ordered.filter(isKeylessModel),
    ...KEYLESS_FALLBACK_MODELS,
  ]);

  return {
    primaryModel: ordered[0],
    pool: unique([...openRouterCandidates, ...keylessCandidates]),
    openRouterCandidates,
    keylessCandidates,
  };
}

/** Orders candidates: healthy models first, cooled-down ones only as a last resort. */
function orderByCooldown(candidates: string[]): string[] {
  const available = candidates.filter((m) => !isModelInCooldown(m));
  const cooling = candidates.filter((m) => isModelInCooldown(m));
  return [...available, ...cooling];
}

function classifyText(text: string): AttemptOutcome {
  const trimmed = (text || '').trim();
  if (!trimmed) return { ok: false, kind: 'empty', message: 'empty response' };
  if (isExhaustionOrRateLimitError(trimmed)) {
    return { ok: false, kind: 'rate_limit', message: trimmed.slice(0, 120) };
  }
  return { ok: true, text: trimmed, latencyMs: 0 };
}

/* -------------------------------------------------------------------------- */
/* OpenRouter attempt                                                          */
/* -------------------------------------------------------------------------- */

async function requestOpenRouter(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<AttemptOutcome> {
  const started = Date.now();

  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (isDailyFreeQuotaError(errorText)) {
        return {
          ok: false,
          kind: 'daily_quota',
          message: `HTTP ${response.status}: ${errorText.slice(0, 160)}`,
          resetAt: parseRateLimitResetMs(response.headers.get('x-ratelimit-reset')),
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          kind: 'key_error',
          message: `HTTP ${response.status}: ${errorText.slice(0, 160)}`,
        };
      }
      if (response.status === 404) {
        return {
          ok: false,
          kind: 'unknown_model',
          message: `HTTP 404: ${errorText.slice(0, 160)}`,
        };
      }
      if (isExhaustionOrRateLimitError(errorText, response.status)) {
        return {
          ok: false,
          kind: 'rate_limit',
          message: `HTTP ${response.status}: ${errorText.slice(0, 160)}`,
        };
      }
      return {
        ok: false,
        kind: 'error',
        message: `OpenRouter HTTP ${response.status} (${model}): ${errorText.slice(0, 160)}`,
      };
    }

    const data: any = await response.json().catch(() => null);

    if (data?.error) {
      const errMsg = String(data.error.message || JSON.stringify(data.error));
      if (isDailyFreeQuotaError(errMsg)) {
        return {
          ok: false,
          kind: 'daily_quota',
          message: errMsg.slice(0, 160),
          resetAt: parseRateLimitResetMs(
            data.error?.metadata?.headers?.['X-RateLimit-Reset'] ??
              data.error?.metadata?.headers?.['x-ratelimit-reset']
          ),
        };
      }
      if (isExhaustionOrRateLimitError(errMsg)) {
        return { ok: false, kind: 'rate_limit', message: errMsg.slice(0, 160) };
      }
      return { ok: false, kind: 'error', message: `Model error on ${model}: ${errMsg.slice(0, 160)}` };
    }

    const msg = data?.choices?.[0]?.message;
    const text = String(msg?.content ?? msg?.reasoning ?? msg?.reasoning_content ?? '').trim();
    const outcome = classifyText(text);
    if (!outcome.ok) return outcome;

    return { ok: true, text: outcome.text, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, kind: 'error', message: String(err?.message || err).slice(0, 160) };
  }
}

/* -------------------------------------------------------------------------- */
/* Keyless (Pollinations) attempt                                              */
/* -------------------------------------------------------------------------- */

async function requestPollinations(
  model: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<AttemptOutcome> {
  const started = Date.now();

  try {
    const response = await fetch(POLLINATIONS_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
        referrer: OPENROUTER_TITLE,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const raw = await response.text().catch(() => '');

    if (!response.ok) {
      const isUnknownModel =
        response.status === 404 ||
        raw.includes('NOT_FOUND') ||
        raw.toLowerCase().includes("isn't on the classic api");
      if (isUnknownModel) {
        return { ok: false, kind: 'unknown_model', message: `HTTP ${response.status}: ${raw.slice(0, 160)}` };
      }
      if (isExhaustionOrRateLimitError(raw, response.status)) {
        return { ok: false, kind: 'rate_limit', message: `HTTP ${response.status}: ${raw.slice(0, 160)}` };
      }
      return {
        ok: false,
        kind: 'error',
        message: `Pollinations HTTP ${response.status}: ${raw.slice(0, 160)}`,
      };
    }

    let data: any = null;
    try {
      data = JSON.parse(raw);
    } catch {
      // Some deployments answer with plain text rather than an OpenAI payload.
      const outcome = classifyText(raw);
      if (!outcome.ok) return outcome;
      return { ok: true, text: outcome.text, latencyMs: Date.now() - started };
    }

    if (data?.error) {
      const errMsg = String(data.error.message || JSON.stringify(data.error));
      if (isExhaustionOrRateLimitError(errMsg, data.status)) {
        return { ok: false, kind: 'rate_limit', message: errMsg.slice(0, 160) };
      }
      return { ok: false, kind: 'error', message: `Pollinations error: ${errMsg.slice(0, 160)}` };
    }

    const msg = data?.choices?.[0]?.message;
    const text = String(msg?.content ?? msg?.reasoning ?? msg?.reasoning_content ?? '').trim();
    const outcome = classifyText(text);
    if (!outcome.ok) return outcome;

    return { ok: true, text: outcome.text, latencyMs: Date.now() - started };
  } catch (err: any) {
    return { ok: false, kind: 'error', message: String(err?.message || err).slice(0, 160) };
  }
}

/**
 * Tries a keyless candidate. Unknown model ids (the classic Pollinations API
 * only serves a subset) are transparently retried against the default model.
 */
async function requestKeylessCandidate(
  candidateModel: string,
  systemPrompt: string,
  userMessage: string,
  temperature: number,
  maxTokens: number,
  timeoutMs: number
): Promise<AttemptOutcome> {
  const requested = candidateModel.startsWith(KEYLESS_MODEL_PREFIX)
    ? candidateModel.slice(KEYLESS_MODEL_PREFIX.length)
    : candidateModel;

  const ladder = unique([
    requested,
    requested === POLLINATIONS_DEFAULT_MODEL ? undefined : POLLINATIONS_DEFAULT_MODEL,
  ]);

  let last: AttemptOutcome | null = null;
  for (const model of ladder) {
    const outcome = await requestPollinations(
      model,
      systemPrompt,
      userMessage,
      temperature,
      maxTokens,
      timeoutMs
    );
    if (outcome.ok) return outcome;
    last = outcome;
    // Only walk the ladder when the id itself is unknown; other failures are final.
    if (outcome.kind !== 'unknown_model') break;
  }

  return last ?? { ok: false, kind: 'error', message: 'no keyless model available' };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Executes a prompt against an agent's candidate pool, rotating across free
 * models, OpenRouter API keys, and finally the keyless Pollinations tier.
 */
export async function executeWithFreeModelRotation(
  agentId: string,
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  apiKey?: string,
  options: RotationOptions = {}
): Promise<RotationResult> {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.3,
  } = options;

  const startedAll = Date.now();
  const totalBudgetMs =
    options.totalBudgetMs ?? Math.min(Math.max(timeoutMs * 2, 25_000), 90_000);

  const { primaryModel, openRouterCandidates, keylessCandidates } = await resolveCandidatePool(agentId);

  const keys = getOpenRouterApiKeys(apiKey);
  const usableKeys = keys.filter((key) => !isApiKeyQuotaExhausted(key));
  const orderedOpenRouter = orderByCooldown(openRouterCandidates);

  const errors: string[] = [];
  let lastError: string | null = null;

  const elapsed = () => Date.now() - startedAll;
  const remainingBudget = () => totalBudgetMs - elapsed();
  /** Time we may spend on OpenRouter while still leaving room for the keyless tier. */
  const openRouterBudgetLeft = () => remainingBudget() - KEYLESS_RESERVE_MS;

  // ---- Tier 1: OpenRouter, across every usable key -------------------------
  outer: for (const key of usableKeys) {
    for (const candidateModel of orderedOpenRouter) {
      const budgetLeft = openRouterBudgetLeft();
      if (budgetLeft < MIN_ATTEMPT_MS) break outer;

      const attemptTimeout = Math.min(timeoutMs, budgetLeft);
      const isRotated = candidateModel !== primaryModel;

      if (isRotated) {
        console.log(
          `[ModelRotation] Seat "${agentName}" (${agentId}) auto-rotated to free candidate: ${candidateModel}`
        );
      }

      const outcome = await requestOpenRouter(
        candidateModel,
        key,
        systemPrompt,
        userMessage,
        temperature,
        maxTokens,
        attemptTimeout
      );

      if (outcome.ok) {
        clearModelCooldown(candidateModel);
        clearApiKeyQuotaExhaustion(key);
        console.log(
          `[ModelRotation] Seat "${agentName}" answered via ${candidateModel} in ${outcome.latencyMs}ms`
        );
        return {
          text: outcome.text,
          modelUsed: candidateModel,
          wasRotated: isRotated,
          latencyMs: outcome.latencyMs,
          tier: 'openrouter',
        };
      }

      lastError = outcome.message;

      if (outcome.kind === 'daily_quota') {
        // This key is out of free requests for the day — every `:free` model on
        // it would 429 the same way, so jump straight to the next key.
        markApiKeyQuotaExhausted(key, outcome.resetAt);
        errors.push(`${candidateModel}: daily quota on key (${outcome.message.slice(0, 80)})`);
        continue outer;
      }

      if (outcome.kind === 'key_error') {
        // Invalid/revoked key: no point trying more models with it.
        errors.push(`${candidateModel}: key rejected (${outcome.message.slice(0, 80)})`);
        console.warn(
          `[ModelRotation] OpenRouter key rejected for ${agentName}, rotating to next key...`
        );
        continue outer;
      }

      if (outcome.kind === 'rate_limit') {
        markModelCooldown(candidateModel, `HTTP/quota: ${outcome.message.slice(0, 100)}`);
        console.warn(
          `[ModelRotation] Quota/Rate limit on ${candidateModel}, auto-switching to next free model...`
        );
        errors.push(`${candidateModel}: rate limited`);
        continue;
      }

      if (outcome.kind === 'unknown_model') {
        markModelCooldown(candidateModel, `Unavailable: ${outcome.message.slice(0, 100)}`, 30 * 60 * 1000);
        errors.push(`${candidateModel}: unavailable`);
        continue;
      }

      errors.push(`${candidateModel}: ${outcome.message.slice(0, 100)}`);
      console.warn(
        `[ModelRotation] Candidate ${candidateModel} for ${agentName} failed: ${outcome.message}`
      );
    }
  }

  if (usableKeys.length === 0 && keys.length > 0) {
    console.warn(
      `[ModelRotation] All ${keys.length} OpenRouter key(s) exhausted for "${agentName}" — using the keyless free tier`
    );
  }

  // ---- Tier 2: keyless Pollinations (no API key, always available) --------
  for (const candidateModel of keylessCandidates) {
    const attemptTimeout = Math.max(MIN_ATTEMPT_MS, Math.min(timeoutMs, remainingBudget()));
    const isRotated = candidateModel !== primaryModel;

    const outcome = await requestKeylessCandidate(
      candidateModel,
      systemPrompt,
      userMessage,
      temperature,
      maxTokens,
      attemptTimeout
    );

    if (outcome.ok) {
      clearModelCooldown(candidateModel);
      console.log(
        `[ModelRotation] Seat "${agentName}" answered via keyless ${candidateModel} in ${outcome.latencyMs}ms`
      );
      return {
        text: outcome.text,
        modelUsed: candidateModel,
        wasRotated: isRotated,
        latencyMs: outcome.latencyMs,
        tier: 'keyless',
      };
    }

    lastError = outcome.message;
    if (outcome.kind === 'rate_limit' || outcome.kind === 'error') {
      markModelCooldown(candidateModel, outcome.message.slice(0, 100), 2 * 60 * 1000);
    }
    errors.push(`${candidateModel} (keyless): ${outcome.message.slice(0, 100)}`);
    console.warn(
      `[ModelRotation] Keyless candidate ${candidateModel} for ${agentName} failed: ${outcome.message}`
    );
  }

  if (areAllApiKeysQuotaExhausted(keys)) {
    throw new FreeQuotaExhaustedError(
      `${describeFreeQuotaExhaustion()} Keyless fallback also failed. Last error: ${lastError ?? 'None'}`
    );
  }

  throw new Error(
    `All available free models for ${agentName} were exhausted or rate-limited. ` +
      `Last error: ${lastError ?? 'None'}. Attempts: ${errors.slice(0, 6).join(' | ')}`
  );
}
