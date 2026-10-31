/**
 * Free Model Rotation & Automatic Fallback Engine
 * 
 * Automatically detects rate limits, token/budget expirations, and upstream outages,
 * and seamlessly rotates between verified active OpenRouter free models without breaking
 * the user session or visual UI branding.
 */

export interface ModelCooldownInfo {
  until: number;
  reason: string;
}

// In-memory cooldown tracking for rate-limited or exhausted free models
const modelCooldownMap = new Map<string, ModelCooldownInfo>();

// Ranked free model candidate pools for each council agent seat
export const SEAT_ROTATION_POOLS: Record<string, string[]> = {
  // Seat 1: NVIDIA Formal Reasoner
  'nemotron-lightning': [
    'nvidia/nemotron-3.5-lightning:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'openrouter/free',
    'liquid/lfm-2.5-2.6b:free',
  ],
  // Seat 2: Cohere Systems Architect & Code
  'north-mini-code': [
    'cohere/north-mini-code:free',
    'liquid/lfm-2.5-2.6b:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'openrouter/free',
    'nvidia/nemotron-3.5-lightning:free',
  ],
  // Seat 3: NVIDIA Ultra Strategic Synthesizer
  'nemotron-ultra': [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'nvidia/nemotron-3.5-super-vl:free',
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    'openrouter/free',
    'nvidia/nemotron-3.5-lightning:free',
    'liquid/lfm-2.5-2.6b:free',
  ],
};

/**
 * Checks if a model is currently within an active cooldown window.
 */
export function isModelInCooldown(modelId: string): boolean {
  const cd = modelCooldownMap.get(modelId);
  if (!cd) return false;
  if (Date.now() >= cd.until) {
    modelCooldownMap.delete(modelId);
    return false;
  }
  return true;
}

/**
 * Marks a model as temporarily exhausted/rate-limited with an automatic cooldown.
 */
export function markModelCooldown(
  modelId: string,
  reason: string,
  durationMs = 8 * 60 * 1000 // default 8 minutes
): void {
  modelCooldownMap.set(modelId, {
    until: Date.now() + durationMs,
    reason,
  });
  console.warn(
    `[ModelRotation] Model ${modelId} placed on cooldown for ${Math.round(durationMs / 1000)}s: ${reason}`
  );
}

/**
 * Clears any cooldown on a model upon confirmed successful generation.
 */
export function clearModelCooldown(modelId: string): void {
  modelCooldownMap.delete(modelId);
}

/**
 * Returns current status of all tracked free models.
 */
export function getModelRotationStatus(): Record<string, { available: boolean; cooldownLeftSeconds: number; reason?: string }> {
  const now = Date.now();
  const status: Record<string, { available: boolean; cooldownLeftSeconds: number; reason?: string }> = {};

  for (const [modelId, cd] of modelCooldownMap.entries()) {
    if (now < cd.until) {
      status[modelId] = {
        available: false,
        cooldownLeftSeconds: Math.max(0, Math.round((cd.until - now) / 1000)),
        reason: cd.reason,
      };
    }
  }
  return status;
}

/**
 * Determines whether an error string or HTTP response indicates quota/rate expiration.
 */
export function isExhaustionOrRateLimitError(errText: string, status?: number): boolean {
  if (status === 429 || status === 402 || status === 503 || status === 502) {
    return true;
  }
  const lower = errText.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('free-models-per-day') ||
    lower.includes('temporarily rate-limited') ||
    lower.includes('busy') ||
    lower.includes('capacity') ||
    lower.includes('overloaded') ||
    lower.includes('credits') ||
    lower.includes('provider returned error')
  );
}

/**
 * Executes a prompt against an agent's candidate pool, automatically rotating
 * through free models if rate limits or errors occur.
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
): Promise<{ text: string; modelUsed: string; wasRotated: boolean }> {
  const { maxTokens = 2500, timeoutMs = 60000, temperature = 0.3 } = options;

  const pool =
    SEAT_ROTATION_POOLS[agentId] ||
    (agentId.includes('north') || agentId.includes('cohere')
      ? SEAT_ROTATION_POOLS['north-mini-code']
      : agentId.includes('ultra')
      ? SEAT_ROTATION_POOLS['nemotron-ultra']
      : SEAT_ROTATION_POOLS['nemotron-lightning']);

  const primaryModel = pool[0];

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

      return {
        text,
        modelUsed: candidateModel,
        wasRotated: isRotated,
      };
    } catch (err: any) {
      lastError = err;
      const errStr = String(err?.message || err);
      if (isExhaustionOrRateLimitError(errStr)) {
        markModelCooldown(candidateModel, errStr.slice(0, 80));
      }
      console.warn(`[ModelRotation] Candidate ${candidateModel} for ${agentName} failed:`, err?.message || err);
      continue;
    }
  }

  throw new Error(
    `All available free models for ${agentName} were exhausted or rate-limited. Last error: ${lastError?.message || 'None'}`
  );
}
