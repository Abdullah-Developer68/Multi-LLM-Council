/**
 * Cooldown bookkeeping + upstream error classification for free OpenRouter models.
 *
 * Kept in its own module so both the rotation engine and the model registry can
 * use it without creating an import cycle.
 */

export interface ModelCooldownInfo {
  until: number;
  reason: string;
}

// In-memory cooldown tracking for rate-limited or exhausted free models
const modelCooldownMap = new Map<string, ModelCooldownInfo>();

/**
 * Account-wide OpenRouter free-tier daily limit state.
 * OpenRouter caps free models at 50 requests/day on accounts with < 10 credits;
 * once exhausted, every free model returns 429 until X-RateLimit-Reset.
 */
let freeQuotaExhaustedUntil = 0;

/** Records that the account-wide free daily quota is exhausted. */
export function markFreeQuotaExhausted(resetAtMs?: number): void {
  const until = resetAtMs && resetAtMs > Date.now() ? resetAtMs : Date.now() + 60 * 60 * 1000;
  freeQuotaExhaustedUntil = until;
  console.warn(
    `[ModelRotation] OpenRouter free-model daily quota exhausted until ${new Date(until).toISOString()}`
  );
}

/** True while the account-wide free daily quota is exhausted. */
export function isFreeQuotaExhausted(): boolean {
  if (freeQuotaExhaustedUntil === 0) return false;
  if (Date.now() >= freeQuotaExhaustedUntil) {
    freeQuotaExhaustedUntil = 0;
    return false;
  }
  return true;
}

/** Epoch ms when the free daily quota resets (0 when not exhausted). */
export function getFreeQuotaResetAt(): number {
  return isFreeQuotaExhausted() ? freeQuotaExhaustedUntil : 0;
}

/** Clears the account-wide exhaustion marker (used by tests). */
export function clearFreeQuotaExhaustion(): void {
  freeQuotaExhaustedUntil = 0;
}

/** Human-readable description of the exhausted quota, including the reset time. */
export function describeFreeQuotaExhaustion(): string {
  const resetAt = getFreeQuotaResetAt();
  const resetText = resetAt
    ? ` Resets at ${new Date(resetAt).toISOString()}.`
    : '';
  return (
    'OpenRouter free-model daily quota exhausted (50 free requests/day on accounts with < 10 credits).' +
    `${resetText} Add 10 credits to raise the limit to 1000 free requests/day.`
  );
}

/** Error thrown when the account-wide free daily quota blocks a generation. */
export class FreeQuotaExhaustedError extends Error {
  constructor(message?: string) {
    super(message || describeFreeQuotaExhaustion());
    this.name = 'FreeQuotaExhaustedError';
  }
}

/** Detects the account-wide free daily quota error (not a single-model hiccup). */
export function isDailyFreeQuotaError(errText: string): boolean {
  const lower = (errText || '').toLowerCase();
  return (
    lower.includes('free-models-per-day') ||
    lower.includes('openrouter_free_tier_daily') ||
    lower.includes('free model requests per day')
  );
}

/** Extracts X-RateLimit-Reset (epoch seconds or ms) from a response, if present. */
export function parseRateLimitResetMs(resetHeader: string | null): number | undefined {
  if (!resetHeader) return undefined;
  const raw = Number(resetHeader);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  // OpenRouter sends epoch seconds; tolerate epoch milliseconds as well.
  return raw > 1e12 ? raw : raw * 1000;
}

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
export function getModelRotationStatus(): Record<
  string,
  { available: boolean; cooldownLeftSeconds: number; reason?: string }
> {
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
  const lower = (errText || '').toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
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
