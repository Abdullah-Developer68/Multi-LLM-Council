/**
 * Cooldown bookkeeping + upstream error classification for free AI models.
 *
 * Two independent pieces of state live here:
 *
 * 1. Per-model cooldowns — a single `:free` model can be rate-limited/queued
 *    while its siblings stay healthy, so we demote just that model briefly.
 * 2. Per-API-key daily quota exhaustion — OpenRouter caps free models at 50
 *    requests/day *per key*. Exhausting one key must never block a fresh key,
 *    so exhaustion is tracked per key instead of with a single global flag.
 *
 * Kept in its own module so both the rotation engine and the model registry can
 * use it without creating an import cycle.
 */

export interface ModelCooldownInfo {
  until: number;
  reason: string;
}

export interface ExhaustedKeyInfo {
  /** Short, non-sensitive label (`sk-or-v1-70a…88f0`) for logs/tests. */
  label: string;
  /** Epoch ms when the key's free daily quota resets. */
  resetAt: number;
}

// In-memory cooldown tracking for rate-limited or exhausted free models
const modelCooldownMap = new Map<string, ModelCooldownInfo>();

/**
 * Per-API-key free-tier daily limit state, keyed by a stable hash of the key.
 * OpenRouter caps free models at 50 requests/day per key on accounts with
 * < 10 credits; once a key is exhausted, every free model on *that key* returns
 * 429 until X-RateLimit-Reset (next UTC midnight).
 */
const exhaustedKeysMap = new Map<string, number>();

/**
 * Legacy account-wide marker. Only set when a caller has no key context at all;
 * normal rotation marks individual keys so fresh keys keep working.
 */
let freeQuotaExhaustedUntil = 0;

const DEFAULT_QUOTA_WINDOW_MS = 60 * 60 * 1000;

/** Cheap, stable FNV-1a hash so we never keep raw API keys as map keys. */
function hashKey(raw: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function normalizeKey(apiKey: string): string {
  return (apiKey || '').trim();
}

function keyId(apiKey: string): string {
  const key = normalizeKey(apiKey);
  if (!key) return 'no-key';
  return `${key.slice(0, 12)}:${hashKey(key)}`;
}

/** Short, log-safe representation of an API key. */
export function describeApiKey(apiKey: string): string {
  const key = normalizeKey(apiKey);
  if (!key) return '(no key)';
  if (key.length <= 20) return `${key.slice(0, 6)}…`;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function resolveResetAt(resetAtMs?: number): number {
  return resetAtMs && resetAtMs > Date.now() ? resetAtMs : Date.now() + DEFAULT_QUOTA_WINDOW_MS;
}

/* -------------------------------------------------------------------------- */
/* Per-key free daily quota                                                    */
/* -------------------------------------------------------------------------- */

/** Records that a specific API key has used up its free-model daily quota. */
export function markApiKeyQuotaExhausted(apiKey: string, resetAtMs?: number): void {
  const id = keyId(apiKey);
  const until = resolveResetAt(resetAtMs);
  const existing = exhaustedKeysMap.get(id) ?? 0;
  const next = Math.max(existing, until);
  exhaustedKeysMap.set(id, next);
  console.warn(
    `[ModelRotation] OpenRouter key ${describeApiKey(apiKey)} free-model daily quota exhausted until ` +
      `${new Date(next).toISOString()} — rotating to the next key/fallback`
  );
}

/** True while this specific API key's free daily quota is exhausted. */
export function isApiKeyQuotaExhausted(apiKey: string): boolean {
  const id = keyId(apiKey);
  const until = exhaustedKeysMap.get(id);
  if (!until) return false;
  if (Date.now() >= until) {
    exhaustedKeysMap.delete(id);
    return false;
  }
  return true;
}

/** Epoch ms when a specific key's free daily quota resets (0 when usable). */
export function getApiKeyQuotaResetAt(apiKey: string): number {
  return isApiKeyQuotaExhausted(apiKey) ? exhaustedKeysMap.get(keyId(apiKey)) ?? 0 : 0;
}

/** Clears the exhaustion marker for a single key (used after a successful call). */
export function clearApiKeyQuotaExhaustion(apiKey: string): void {
  exhaustedKeysMap.delete(keyId(apiKey));
}

/** True when every supplied key is exhausted (an empty list is *not* exhausted). */
export function areAllApiKeysQuotaExhausted(apiKeys: string[]): boolean {
  const keys = (apiKeys || []).filter((k) => normalizeKey(k).length > 0);
  if (keys.length === 0) return false;
  return keys.every((key) => isApiKeyQuotaExhausted(key));
}

/** Snapshot of every currently-exhausted key, for diagnostics/tests. */
export function getExhaustedApiKeys(): ExhaustedKeyInfo[] {
  const now = Date.now();
  const out: ExhaustedKeyInfo[] = [];
  for (const [id, until] of exhaustedKeysMap.entries()) {
    if (now >= until) {
      exhaustedKeysMap.delete(id);
      continue;
    }
    out.push({ label: id.split(':')[0], resetAt: until });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Legacy account-wide marker                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Records that free-model quota is exhausted for the whole account.
 *
 * Prefer `markApiKeyQuotaExhausted()` — this only exists for callers that have
 * no API-key context, and it is intentionally a *last* signal so a single dead
 * key can never block a fresh one.
 */
export function markFreeQuotaExhausted(resetAtMs?: number): void {
  const until = resolveResetAt(resetAtMs);
  freeQuotaExhaustedUntil = Math.max(freeQuotaExhaustedUntil, until);
  console.warn(
    `[ModelRotation] OpenRouter free-model daily quota exhausted until ${new Date(
      freeQuotaExhaustedUntil
    ).toISOString()}`
  );
}

/**
 * True only when the legacy account-wide marker is active.
 *
 * Per-key exhaustion is deliberately *not* folded in here: one dead key must
 * never look like "everything is exhausted". Callers that care about a specific
 * key use `isApiKeyQuotaExhausted()`, and callers that care about a set of keys
 * use `areAllApiKeysQuotaExhausted()`. The keyless Pollinations tier still
 * answers even when this returns true.
 */
export function isFreeQuotaExhausted(): boolean {
  if (freeQuotaExhaustedUntil === 0) return false;
  if (Date.now() >= freeQuotaExhaustedUntil) {
    freeQuotaExhaustedUntil = 0;
    return false;
  }
  return true;
}

/** Epoch ms when free OpenRouter capacity returns (0 when not exhausted). */
export function getFreeQuotaResetAt(): number {
  const now = Date.now();
  let resetAt = freeQuotaExhaustedUntil > now ? freeQuotaExhaustedUntil : 0;
  for (const [id, until] of exhaustedKeysMap.entries()) {
    if (now >= until) {
      exhaustedKeysMap.delete(id);
      continue;
    }
    resetAt = Math.max(resetAt, until);
  }
  return resetAt;
}

/** Clears every exhaustion marker (per-key and account-wide). Used by tests. */
export function clearFreeQuotaExhaustion(): void {
  freeQuotaExhaustedUntil = 0;
  exhaustedKeysMap.clear();
}

/** Human-readable description of the exhausted quota, including the reset time. */
export function describeFreeQuotaExhaustion(): string {
  const resetAt = getFreeQuotaResetAt();
  const resetText = resetAt ? ` Resets at ${new Date(resetAt).toISOString()}.` : '';
  const exhausted = getExhaustedApiKeys();
  const keyText =
    exhausted.length > 0
      ? ` Exhausted keys: ${exhausted.map((k) => k.label).join(', ')}.`
      : '';
  return (
    'OpenRouter free-model daily quota exhausted (50 free requests/day per key on accounts with < 10 credits).' +
    `${keyText}${resetText} Add 10 credits to raise the limit to 1000 free requests/day, ` +
    'or rely on the keyless Pollinations fallback tier.'
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
    lower.includes('free model requests per day') ||
    lower.includes('free-models-per-day-limit')
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

/* -------------------------------------------------------------------------- */
/* Per-model cooldowns                                                         */
/* -------------------------------------------------------------------------- */

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
