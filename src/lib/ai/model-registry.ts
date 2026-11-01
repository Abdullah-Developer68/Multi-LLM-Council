/**
 * Verified Free Model Registry
 *
 * On every login we re-validate our 3 council-seat models against the live
 * OpenRouter catalog, make sure they are strictly free (prompt & completion
 * pricing === 0, or an explicit `:free` id), probe their availability/latency,
 * pick the fastest working free model as the seat's primary, and persist the
 * result into PostgreSQL (`verified_free_models`).
 *
 * The orchestrator then reads those persisted records back through
 * `getConfiguredModelsFromDb()` so real chat turns only ever spend their
 * latency budget on models we already know are free and reachable.
 */

import { sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  verifiedFreeModels,
  type VerifiedFreeModelRow,
} from '../../db/schema';
import { COUNCIL_AGENTS } from './agents';
import { getSeatPool } from './seat-pools';
import {
  clearModelCooldown,
  isDailyFreeQuotaError,
  isExhaustionOrRateLimitError,
  isFreeQuotaExhausted,
  isModelInCooldown,
  markFreeQuotaExhausted,
  markModelCooldown,
  parseRateLimitResetMs,
} from './model-cooldown';
import { getOpenRouterApiKey } from './env';

export interface VerifiedModelConfig {
  seatId: string;
  agentName: string;
  primaryModel: string;
  fallbackModels: string[];
  provider: string;
  isFree: boolean;
  isAvailable: boolean;
  latencyMs: number | null;
  verifiedAt: Date;
}

export interface VerifyOptions {
  /** Run the (quota-consuming) availability/latency probes. */
  deep?: boolean;
  /** Timeout for each individual probe. */
  probeTimeoutMs?: number;
  /** Bypass the short-lived verification cache and force a fresh run. */
  force?: boolean;
  apiKey?: string;
}

interface OpenRouterCatalogModel {
  id: string;
  name?: string;
  pricing?: { prompt?: string | number; completion?: string | number };
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const CATALOG_TTL_MS = 5 * 60 * 1000;
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const DEEP_VERIFY_MIN_INTERVAL_MS = 60 * 1000;
/** Rapid consecutive logins reuse a just-completed verification. */
const FAST_VERIFY_MIN_INTERVAL_MS = 10 * 1000;
/**
 * Latency probes cost 3-6 free requests, and OpenRouter only allows 50 free
 * requests/day on accounts with < 10 credits. Probe on the first login and then
 * at most every 6 hours; catalog verification still runs on every login.
 */
const LOGIN_DEEP_PROBE_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Never burn more than this many probe requests per seat (free-tier friendly). */
const MAX_PROBE_ATTEMPTS_PER_SEAT = 2;
const PROBE_MAX_TOKENS = 48;

interface RegistryState {
  tableEnsured: boolean;
  catalogCache: { fetchedAt: number; models: Map<string, OpenRouterCatalogModel> } | null;
  configCache: { fetchedAt: number; configs: VerifiedModelConfig[] } | null;
  inflightFastVerify: Promise<VerifiedModelConfig[]> | null;
  inflightDeepVerify: Promise<VerifiedModelConfig[]> | null;
  lastDeepVerifyAt: number;
  lastFastVerifyAt: number;
}

// Stored on globalThis so Expo/Metro dev module reloads don't lose the warm caches.
const globalRegistry = globalThis as unknown as { __traModelRegistry?: RegistryState };
const state: RegistryState = (globalRegistry.__traModelRegistry ??= {
  tableEnsured: false,
  catalogCache: null,
  configCache: null,
  inflightFastVerify: null,
  inflightDeepVerify: null,
  lastDeepVerifyAt: 0,
  lastFastVerifyAt: 0,
});

/* -------------------------------------------------------------------------- */
/* Table bootstrap                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Idempotently creates `verified_free_models`, so persistence works immediately
 * even before a drizzle-kit migration has been applied.
 */
export async function ensureVerifiedModelsTable(): Promise<void> {
  if (state.tableEnsured) return;

  // Check first so the normal path doesn't emit a "relation already exists"
  // NOTICE on every server boot.
  const existing: any = await db.execute(
    sql`SELECT to_regclass('public.verified_free_models') AS table_name`
  );
  const rows = Array.isArray(existing) ? existing : existing?.rows ?? [];
  const tableName = rows[0]?.table_name;

  if (!tableName) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS verified_free_models (
        seat_id text PRIMARY KEY,
        agent_name text NOT NULL,
        primary_model text NOT NULL,
        fallback_models jsonb NOT NULL,
        provider text NOT NULL,
        is_free boolean NOT NULL DEFAULT true,
        is_available boolean NOT NULL DEFAULT true,
        latency_ms integer,
        verified_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  state.tableEnsured = true;
}

/* -------------------------------------------------------------------------- */
/* Live OpenRouter catalog                                                     */
/* -------------------------------------------------------------------------- */

/** A model counts as free only when both prompt and completion price are zero. */
export function isStrictlyFreeModel(model: OpenRouterCatalogModel): boolean {
  const prompt = Number(model.pricing?.prompt ?? -1);
  const completion = Number(model.pricing?.completion ?? -1);
  const zeroPriced = prompt === 0 && completion === 0;
  return zeroPriced || model.id.endsWith(':free');
}

/** Fetches (and caches) the live OpenRouter model catalog. Returns null on failure. */
export async function fetchOpenRouterCatalog(options: {
  force?: boolean;
  timeoutMs?: number;
} = {}): Promise<Map<string, OpenRouterCatalogModel> | null> {
  const { force = false, timeoutMs = 8000 } = options;
  if (!force && state.catalogCache && Date.now() - state.catalogCache.fetchedAt < CATALOG_TTL_MS) {
    return state.catalogCache.models;
  }

  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Catalog HTTP ${res.status}`);
    }
    const payload: any = await res.json();
    const list: OpenRouterCatalogModel[] = Array.isArray(payload?.data) ? payload.data : [];
    const models = new Map<string, OpenRouterCatalogModel>();
    for (const m of list) {
      if (m?.id) models.set(m.id, m);
    }
    state.catalogCache = { fetchedAt: Date.now(), models };
    return models;
  } catch (err: any) {
    console.warn('[ModelRegistry] Unable to fetch live OpenRouter catalog:', err?.message || err);
    return state.catalogCache?.models ?? null;
  }
}

/* -------------------------------------------------------------------------- */
/* Availability / latency probing                                              */
/* -------------------------------------------------------------------------- */

interface ProbeResult {
  model: string;
  ok: boolean;
  latencyMs: number | null;
  rateLimited: boolean;
  reason?: string;
}

async function probeModel(modelId: string, apiKey: string, timeoutMs: number): Promise<ProbeResult> {
  const started = Date.now();

  // Never burn a request when the account-wide daily free quota is exhausted.
  if (isFreeQuotaExhausted()) {
    return {
      model: modelId,
      ok: false,
      latencyMs: null,
      rateLimited: true,
      reason: 'free daily quota exhausted',
    };
  }

  try {
    const res = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:8081',
        'X-Title': 'TRA Model Verification',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        temperature: 0,
        max_tokens: PROBE_MAX_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (isDailyFreeQuotaError(errText)) {
        markFreeQuotaExhausted(parseRateLimitResetMs(res.headers.get('x-ratelimit-reset')));
        return {
          model: modelId,
          ok: false,
          latencyMs: null,
          rateLimited: true,
          reason: 'free daily quota exhausted',
        };
      }
      const rateLimited = isExhaustionOrRateLimitError(errText, res.status);
      if (rateLimited) {
        // Demote rate-limited/dead models for a short window so chat turns skip them.
        markModelCooldown(modelId, `Probe HTTP ${res.status}: ${errText.slice(0, 80)}`, 2 * 60 * 1000);
      }
      return {
        model: modelId,
        ok: false,
        latencyMs: null,
        rateLimited,
        reason: `HTTP ${res.status}`,
      };
    }

    const latencyMs = Date.now() - started;
    const data: any = await res.json().catch(() => null);

    if (data?.error) {
      const errMsg = data.error.message || JSON.stringify(data.error);
      if (isDailyFreeQuotaError(errMsg)) {
        markFreeQuotaExhausted(
          parseRateLimitResetMs(data.error?.metadata?.headers?.['X-RateLimit-Reset'])
        );
        return {
          model: modelId,
          ok: false,
          latencyMs: null,
          rateLimited: true,
          reason: 'free daily quota exhausted',
        };
      }
      const rateLimited = isExhaustionOrRateLimitError(errMsg);
      if (rateLimited) {
        markModelCooldown(modelId, `Probe error: ${errMsg.slice(0, 80)}`, 2 * 60 * 1000);
      }
      return { model: modelId, ok: false, latencyMs: null, rateLimited, reason: errMsg.slice(0, 120) };
    }

    const text = String(
      data?.choices?.[0]?.message?.content ??
        data?.choices?.[0]?.message?.reasoning ??
        data?.choices?.[0]?.message?.reasoning_content ??
        ''
    ).trim();
    if (!text) {
      return { model: modelId, ok: false, latencyMs: null, rateLimited: false, reason: 'empty response' };
    }
    if (isExhaustionOrRateLimitError(text)) {
      markModelCooldown(modelId, `Probe text: ${text.slice(0, 80)}`, 2 * 60 * 1000);
      return { model: modelId, ok: false, latencyMs: null, rateLimited: true, reason: text.slice(0, 120) };
    }

    clearModelCooldown(modelId);
    return { model: modelId, ok: true, latencyMs, rateLimited: false };
  } catch (err: any) {
    return {
      model: modelId,
      ok: false,
      latencyMs: null,
      rateLimited: false,
      reason: String(err?.message || err).slice(0, 120),
    };
  }
}

/**
 * Probes candidates for one seat sequentially until one answers, so a single
 * verification run stays well inside OpenRouter's free-tier request limit
 * (max 2 attempts per seat, 3 seats probed concurrently => <= 6 requests).
 */
async function probeSeatCandidates(
  candidates: string[],
  apiKey: string,
  timeoutMs: number
): Promise<{ winner: ProbeResult | null; attempted: ProbeResult[] }> {
  const attempted: ProbeResult[] = [];
  const toTry = candidates.slice(0, MAX_PROBE_ATTEMPTS_PER_SEAT);

  for (const model of toTry) {
    const result = await probeModel(model, apiKey, timeoutMs);
    attempted.push(result);
    if (result.ok) {
      return { winner: result, attempted };
    }
  }

  return { winner: null, attempted };
}

/* -------------------------------------------------------------------------- */
/* Seat resolution                                                             */
/* -------------------------------------------------------------------------- */

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toConfig(row: VerifiedFreeModelRow): VerifiedModelConfig {
  return {
    seatId: row.seatId,
    agentName: row.agentName,
    primaryModel: row.primaryModel,
    fallbackModels: Array.isArray(row.fallbackModels) ? row.fallbackModels : [],
    provider: row.provider,
    isFree: row.isFree,
    isAvailable: row.isAvailable,
    latencyMs: row.latencyMs ?? null,
    verifiedAt: row.verifiedAt instanceof Date ? row.verifiedAt : new Date(row.verifiedAt),
  };
}

async function readPersistedConfigs(): Promise<VerifiedModelConfig[]> {
  await ensureVerifiedModelsTable();
  const rows = await db.select().from(verifiedFreeModels);
  return rows.map(toConfig);
}

/** Uses the warm in-memory cache when possible, otherwise reads PostgreSQL. */
async function readExistingConfigs(force: boolean): Promise<VerifiedModelConfig[]> {
  if (
    !force &&
    state.configCache &&
    Date.now() - state.configCache.fetchedAt < CONFIG_CACHE_TTL_MS
  ) {
    return state.configCache.configs;
  }
  try {
    return await readPersistedConfigs();
  } catch (err: any) {
    console.warn('[ModelRegistry] Unable to read existing seat configs:', err?.message || err);
    return [];
  }
}

/**
 * Builds the verified configuration for all 3 council seats.
 */
async function resolveSeatConfigs(
  options: Required<Pick<VerifyOptions, 'deep' | 'probeTimeoutMs' | 'force'>> & { apiKey?: string }
): Promise<VerifiedModelConfig[]> {
  const { deep, probeTimeoutMs, force, apiKey } = options;

  const [catalog, existingRows] = await Promise.all([
    fetchOpenRouterCatalog(),
    readExistingConfigs(force),
  ]);

  const existingBySeat = new Map(existingRows.map((r) => [r.seatId, r]));
  const verifiedAt = new Date();

  const seatConfigs = await Promise.all(
    COUNCIL_AGENTS.map(async (agent): Promise<VerifiedModelConfig> => {
      const curated = unique(getSeatPool(agent.id));

      // Keep only models that exist in the live catalog *and* are strictly free.
      let candidates = catalog
        ? curated.filter((id) => {
            const m = catalog.get(id);
            return !!m && isStrictlyFreeModel(m);
          })
        : [...curated];

      // Safety net: never leave a seat without candidates.
      if (candidates.length === 0) candidates = [...curated];

      const previous = existingBySeat.get(agent.id);
      let primaryModel = candidates[0];
      let fallbackModels = candidates.slice(1);
      let latencyMs: number | null = previous?.latencyMs ?? null;

      // Fast verification stays stable: keep the previously verified primary
      // while it is still present in the live free catalog.
      if (!deep && previous?.primaryModel && candidates.includes(previous.primaryModel)) {
        const ordered = unique([
          previous.primaryModel,
          ...(previous.fallbackModels || []),
          ...candidates,
        ]);
        primaryModel = ordered[0];
        fallbackModels = ordered.slice(1);
      }

      if (deep && apiKey && candidates.length > 0) {
        const { winner, attempted } = await probeSeatCandidates(
          candidates,
          apiKey,
          probeTimeoutMs
        );

        if (winner) {
          const attemptedFailures = new Set(
            attempted.filter((p) => !p.ok).map((p) => p.model)
          );
          // Keep the curated order for untried candidates; demote failures.
          const ranked = unique([
            winner.model,
            ...candidates.filter((c) => c !== winner.model && !attemptedFailures.has(c)),
            ...candidates.filter((c) => attemptedFailures.has(c)),
          ]);

          primaryModel = ranked[0];
          fallbackModels = ranked.slice(1);
          latencyMs = winner.latencyMs;

          console.log(
            `[ModelRegistry] Seat ${agent.id}: probe OK on ${winner.model} (${latencyMs}ms, ` +
              `${attempted.length} attempt${attempted.length === 1 ? '' : 's'})`
          );
        } else {
          // No probe could confirm latency (account-wide free-tier quota, or a
          // transient network hiccup). Keep the previously verified / curated
          // primary instead of churning the seat configuration; chat-time
          // rotation still fails over fast if a specific model is unhealthy.
          latencyMs = previous?.latencyMs ?? null;
          console.warn(
            `[ModelRegistry] Seat ${agent.id}: no probe succeeded (${attempted
              .map((p) => `${p.model}: ${p.reason || 'failed'}`)
              .join('; ')}), keeping catalog-verified primary=${primaryModel}`
          );
        }
      }

      const isAvailable = [primaryModel, ...fallbackModels].some((m) => !isModelInCooldown(m));

      return {
        seatId: agent.id,
        agentName: agent.name,
        primaryModel,
        fallbackModels,
        provider: agent.provider,
        isFree: true,
        isAvailable,
        latencyMs,
        verifiedAt,
      };
    })
  );

  return seatConfigs;
}

/** Upserts the seat configs in one round-trip and refreshes the in-memory cache. */
async function persistSeatConfigs(configs: VerifiedModelConfig[]): Promise<VerifiedModelConfig[]> {
  await ensureVerifiedModelsTable();

  if (configs.length > 0) {
    await db
      .insert(verifiedFreeModels)
      .values(
        configs.map((config) => ({
          seatId: config.seatId,
          agentName: config.agentName,
          primaryModel: config.primaryModel,
          fallbackModels: config.fallbackModels,
          provider: config.provider,
          isFree: config.isFree,
          isAvailable: config.isAvailable,
          latencyMs: config.latencyMs,
          verifiedAt: config.verifiedAt,
        }))
      )
      .onConflictDoUpdate({
        target: verifiedFreeModels.seatId,
        set: {
          agentName: sql`excluded.agent_name`,
          primaryModel: sql`excluded.primary_model`,
          fallbackModels: sql`excluded.fallback_models`,
          provider: sql`excluded.provider`,
          isFree: sql`excluded.is_free`,
          isAvailable: sql`excluded.is_available`,
          latencyMs: sql`excluded.latency_ms`,
          verifiedAt: sql`excluded.verified_at`,
        },
      });
  }

  state.configCache = { fetchedAt: Date.now(), configs };
  return configs;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Verifies the 3 council seats against the live OpenRouter catalog, optionally
 * probes their latency, and persists the outcome in `verified_free_models`.
 */
export async function verifyAndPersistFreeModels(options: VerifyOptions = {}): Promise<VerifiedModelConfig[]> {
  const { deep = false, probeTimeoutMs = 5000, force = false } = options;
  const apiKey = options.apiKey ?? getOpenRouterApiKey();

  const run = async (): Promise<VerifiedModelConfig[]> => {
    const started = Date.now();
    const configs = await resolveSeatConfigs({
      deep,
      probeTimeoutMs,
      force,
      apiKey: apiKey || undefined,
    });
    await persistSeatConfigs(configs);
    console.log(
      `[ModelRegistry] ${deep ? 'Deep' : 'Catalog'} verification persisted ` +
        `(${Date.now() - started}ms): ${configs.map((c) => `${c.seatId} -> ${c.primaryModel}`).join(', ')}`
    );
    return configs;
  };

  // Share concurrent runs so a burst of logins only verifies once.
  if (deep) {
    if (state.inflightDeepVerify) return state.inflightDeepVerify;
    if (
      !force &&
      state.configCache &&
      Date.now() - state.lastDeepVerifyAt < DEEP_VERIFY_MIN_INTERVAL_MS
    ) {
      return state.configCache.configs;
    }
    state.inflightDeepVerify = run()
      .then((configs) => {
        state.lastDeepVerifyAt = Date.now();
        return configs;
      })
      .finally(() => {
        state.inflightDeepVerify = null;
      });
    return state.inflightDeepVerify;
  }

  if (state.inflightFastVerify) return state.inflightFastVerify;
  if (
    !force &&
    state.configCache &&
    Date.now() - state.lastFastVerifyAt < FAST_VERIFY_MIN_INTERVAL_MS
  ) {
    return state.configCache.configs;
  }

  state.inflightFastVerify = run()
    .then((configs) => {
      state.lastFastVerifyAt = Date.now();
      return configs;
    })
    .finally(() => {
      state.inflightFastVerify = null;
    });
  return state.inflightFastVerify;
}

/**
 * Login helper: guarantees fresh catalog verification + DB upsert within a hard
 * latency budget, then refreshes latency probes in the background.
 */
export async function verifyFreeModelsOnLogin(budgetMs = 4500): Promise<VerifiedModelConfig[]> {
  let configs: VerifiedModelConfig[] = [];

  try {
    configs = await Promise.race([
      verifyAndPersistFreeModels({ deep: false, force: true }),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`login model verification exceeded ${budgetMs}ms budget`)),
          budgetMs
        );
        // Don't keep the process alive because of this timer.
        (timer as any)?.unref?.();
      }),
    ]);
  } catch (err: any) {
    console.warn('[ModelRegistry] Fast login verification fell back to cache/DB:', err?.message || err);
    configs = await getConfiguredModelsFromDb(true).catch(() => []);
  }

  // Kick off latency probes without blocking the login response.
  // Skipped while the account-wide free daily quota is exhausted, and limited to
  // once every 6 hours so login verification doesn't starve chat of free requests.
  if (
    !isFreeQuotaExhausted() &&
    Date.now() - state.lastDeepVerifyAt >= LOGIN_DEEP_PROBE_MIN_INTERVAL_MS
  ) {
    void verifyAndPersistFreeModels({ deep: true, probeTimeoutMs: 5000 }).catch((err) => {
      console.warn('[ModelRegistry] Background deep verification failed:', err?.message || err);
    });
  }

  return configs;
}

/**
 * Loads the verified free models from the in-memory cache, falling back to
 * PostgreSQL, so the rotation engine always uses DB-persisted seat configs.
 */
export async function getConfiguredModelsFromDb(force = false): Promise<VerifiedModelConfig[]> {
  if (!force && state.configCache && Date.now() - state.configCache.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return state.configCache.configs;
  }

  try {
    const rows = await readPersistedConfigs();
    if (rows.length > 0) {
      state.configCache = { fetchedAt: Date.now(), configs: rows };
      return rows;
    }
  } catch (err: any) {
    console.warn('[ModelRegistry] Unable to load verified_free_models from PostgreSQL:', err?.message || err);
  }

  return state.configCache?.configs ?? [];
}

/** Returns the persisted verified config for one council seat (or null). */
export async function getConfiguredModelForSeat(seatId: string): Promise<VerifiedModelConfig | null> {
  const configs = await getConfiguredModelsFromDb();
  return configs.find((c) => c.seatId === seatId) ?? null;
}

/** Test/debug helper: resets all in-module caches. */
export function resetModelRegistryCache(): void {
  state.catalogCache = null;
  state.configCache = null;
  state.lastDeepVerifyAt = 0;
  state.lastFastVerifyAt = 0;
  state.inflightFastVerify = null;
  state.inflightDeepVerify = null;
}
