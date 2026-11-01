/**
 * Free Model Rotation & Automatic Fallback Engine
 *
 * Automatically detects rate limits, token/budget expirations, and upstream outages,
 * and seamlessly rotates between verified active OpenRouter free models without breaking
 * the user session or visual UI branding.
 *
 * The candidate pool for each council seat comes from PostgreSQL
 * (`verified_free_models`, refreshed on every login by `model-registry.ts`), with the
 * static curated pools used only as a bootstrap fallback.
 */

import { getSeatPool, SEAT_ROTATION_POOLS } from './seat-pools';
import { getConfiguredModelsFromDb } from './model-registry';
import {
  clearFreeQuotaExhaustion,
  clearModelCooldown,
  describeFreeQuotaExhaustion,
  FreeQuotaExhaustedError,
  getFreeQuotaResetAt,
  getModelRotationStatus,
  isDailyFreeQuotaError,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  isModelInCooldown,
  markFreeQuotaExhausted,
  markModelCooldown,
  parseRateLimitResetMs,
} from './model-cooldown';

export { SEAT_ROTATION_POOLS };
export {
  clearModelCooldown,
  clearFreeQuotaExhaustion,
  describeFreeQuotaExhaustion,
  FreeQuotaExhaustedError,
  getFreeQuotaResetAt,
  getModelRotationStatus,
  isDailyFreeQuotaError,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  isModelInCooldown,
  markFreeQuotaExhausted,
  markModelCooldown,
};
export type { ModelCooldownInfo } from './model-cooldown';

/** Default generation budget per candidate — fast answers, fast failover. */
export const DEFAULT_MAX_TOKENS = 1200;
export const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Builds the ordered candidate list for a seat: DB-verified primary first, then
 * its verified fallbacks, then the static curated pool as a last resort.
 */
async function resolveCandidatePool(agentId: string): Promise<{ primaryModel: string; pool: string[] }> {
  const staticPool = getSeatPool(agentId);

  try {
    const configs = await getConfiguredModelsFromDb();
    const seat = configs.find((c) => c.seatId === agentId);
    if (seat?.primaryModel) {
      const pool = Array.from(
        new Set([seat.primaryModel, ...(seat.fallbackModels || []), ...staticPool].filter(Boolean))
      );
      return { primaryModel: seat.primaryModel, pool };
    }
  } catch (err: any) {
    console.warn('[ModelRotation] Falling back to static seat pool:', err?.message || err);
  }

  return { primaryModel: staticPool[0], pool: staticPool };
}

/**
 * Executes a prompt against an agent's candidate pool, automatically rotating
 * through verified free models if rate limits or errors occur.
 */
export async function executeWithFreeModelRotation(
  agentId: string,
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  options: {
    maxTokens?: number;
    timeoutMs?: number;
    temperature?: number;
  } = {}
): Promise<{ text: string; modelUsed: string; wasRotated: boolean; latencyMs: number }> {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.3,
  } = options;

  // Account-wide free daily quota exhausted: fail fast with an actionable
  // message instead of burning one request per fallback model.
  if (isFreeQuotaExhausted()) {
    throw new FreeQuotaExhaustedError();
  }

  const { primaryModel, pool } = await resolveCandidatePool(agentId);

  // Partition candidates: available ones first, cooled-down ones as last resort
  const availableCandidates = pool.filter((m) => !isModelInCooldown(m));
  const coolingCandidates = pool.filter((m) => isModelInCooldown(m));
  const candidatesToTry = availableCandidates.length > 0 ? availableCandidates : coolingCandidates;

  let lastError: Error | null = null;

  for (let i = 0; i < candidatesToTry.length; i++) {
    const candidateModel = candidatesToTry[i];
    const isRotated = candidateModel !== primaryModel;

    if (isRotated) {
      console.log(`[ModelRotation] Seat "${agentName}" (${agentId}) auto-rotated to free candidate: ${candidateModel}`);
    }

    try {
      const started = Date.now();
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:8081',
          'X-Title': 'TRA Multi-Agent Council',
        },
        body: JSON.stringify({
          model: candidateModel,
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
        const errorText = await response.text();
        if (isDailyFreeQuotaError(errorText)) {
          markFreeQuotaExhausted(
            parseRateLimitResetMs(response.headers.get('x-ratelimit-reset'))
          );
          throw new FreeQuotaExhaustedError();
        }
        if (isExhaustionOrRateLimitError(errorText, response.status)) {
          markModelCooldown(candidateModel, `HTTP ${response.status}: ${errorText.slice(0, 100)}`);
          console.warn(`[ModelRotation] Quota/Rate limit on ${candidateModel}, auto-switching to next free model...`);
          continue;
        }
        throw new Error(`OpenRouter HTTP ${response.status} (${candidateModel}): ${errorText}`);
      }

      const data = await response.json();

      // Check if upstream response payload indicates rate limiting or error
      if (data?.error) {
        const errMsg = data.error.message || JSON.stringify(data.error);
        if (isDailyFreeQuotaError(errMsg)) {
          markFreeQuotaExhausted(
            parseRateLimitResetMs(data.error?.metadata?.headers?.['X-RateLimit-Reset'])
          );
          throw new FreeQuotaExhaustedError();
        }
        if (isExhaustionOrRateLimitError(errMsg)) {
          markModelCooldown(candidateModel, errMsg);
          console.warn(`[ModelRotation] Error response from ${candidateModel}, auto-switching: ${errMsg}`);
          continue;
        }
        throw new Error(`Model error on ${candidateModel}: ${errMsg}`);
      }

      const msg = data.choices?.[0]?.message;
      const text = (msg?.content || msg?.reasoning || '').trim();

      // If the model returned an empty string or refusal, try next model
      if (!text || text.length === 0) {
        console.warn(`[ModelRotation] Model ${candidateModel} returned empty text, rotating...`);
        continue;
      }

      // Check if the response text itself is a rate limit error message (some free providers return this as text)
      if (isExhaustionOrRateLimitError(text)) {
        markModelCooldown(candidateModel, text.slice(0, 80));
        console.warn(`[ModelRotation] Response text indicated rate-limit on ${candidateModel}, rotating...`);
        continue;
      }

      // Success! Clear any cooldown on this model
      clearModelCooldown(candidateModel);
      const latencyMs = Date.now() - started;
      console.log(
        `[ModelRotation] Seat "${agentName}" answered via ${candidateModel} in ${latencyMs}ms`
      );

      return {
        text,
        modelUsed: candidateModel,
        wasRotated: isRotated,
        latencyMs,
      };
    } catch (err: any) {
      // Account-wide quota exhaustion must abort rotation immediately instead of
      // burning one request per fallback model.
      if (err instanceof FreeQuotaExhaustedError) {
        throw err;
      }
      lastError = err;
      const errStr = String(err?.message || err);
      if (isExhaustionOrRateLimitError(errStr)) {
        markModelCooldown(candidateModel, errStr.slice(0, 80));
      }
      console.warn(`[ModelRotation] Candidate ${candidateModel} for ${agentName} failed:`, err?.message || err);
      continue;
    }
  }

  if (isFreeQuotaExhausted()) {
    throw new FreeQuotaExhaustedError();
  }

  throw new Error(
    `All available free models for ${agentName} were exhausted or rate-limited. Last error: ${lastError?.message || 'None'}`
  );
}
