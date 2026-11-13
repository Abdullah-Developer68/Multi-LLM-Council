/**
 * In-memory health bookkeeping for free models and OpenRouter keys.
 *
 * - Model cooldowns: one `:free` model can be rate-limited while its siblings
 *   are fine, so we demote just that model for a few minutes.
 * - Key exhaustion: OpenRouter caps free models at 50 requests/day per key on
 *   accounts with < 10 credits. An exhausted key is skipped until its reset.
 *
 * State lives on globalThis so dev-server module reloads keep it.
 */

interface HealthState {
  cooldowns: Map<string, { until: number; reason: string }>;
  exhaustedKeys: Map<string, number>;
}

const g = globalThis as unknown as { __traHealth?: HealthState };
const state: HealthState = (g.__traHealth ??= { cooldowns: new Map(), exhaustedKeys: new Map() });

/** FNV-1a so raw API keys are never used as map keys or logged. */
function keyId(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

export function describeKey(key: string): string {
  return key.length > 20 ? `${key.slice(0, 10)}…${key.slice(-4)}` : '(short key)';
}

export function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/* Models ------------------------------------------------------------------- */

export function isCoolingDown(model: string): boolean {
  const entry = state.cooldowns.get(model);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    state.cooldowns.delete(model);
    return false;
  }
  return true;
}

export function coolDown(model: string, reason: string, ms = 5 * 60_000): void {
  state.cooldowns.set(model, { until: Date.now() + ms, reason });
  console.warn(`[ai] ${model} cooling down for ${Math.round(ms / 1000)}s: ${reason.slice(0, 120)}`);
}

export function clearCooldown(model: string): void {
  state.cooldowns.delete(model);
}

/** Healthy models first, cooling ones last (still tried as a last resort). */
export function orderByHealth(models: string[]): string[] {
  return [...models.filter((m) => !isCoolingDown(m)), ...models.filter((m) => isCoolingDown(m))];
}

/* Keys --------------------------------------------------------------------- */

export function markKeyExhausted(key: string, resetAt?: number): void {
  const until = resetAt && resetAt > Date.now() ? resetAt : nextUtcMidnight();
  state.exhaustedKeys.set(keyId(key), until);
  console.warn(`[ai] key ${describeKey(key)} exhausted until ${new Date(until).toISOString()}`);
}

export function isKeyExhausted(key: string): boolean {
  const id = keyId(key);
  const until = state.exhaustedKeys.get(id);
  if (!until) return false;
  if (Date.now() >= until) {
    state.exhaustedKeys.delete(id);
    return false;
  }
  return true;
}

export function clearKeyExhaustion(key: string): void {
  state.exhaustedKeys.delete(keyId(key));
}

/* Error classification ------------------------------------------------------ */

export function isDailyQuotaError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes('free-models-per-day') || t.includes('free model requests per day');
}

export function isRateLimitError(text: string, status?: number): boolean {
  if (status && [402, 429, 502, 503].includes(status)) return true;
  const t = text.toLowerCase();
  return ['rate limit', 'rate-limit', 'quota', 'overloaded', 'capacity', 'busy', 'provider returned error'].some(
    (needle) => t.includes(needle),
  );
}

/** OpenRouter sends X-RateLimit-Reset as epoch seconds (tolerate ms too). */
export function parseResetHeader(value: string | null | undefined): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n > 1e12 ? n : n * 1000;
}
