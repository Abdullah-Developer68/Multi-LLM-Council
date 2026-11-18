/**
 * Verified free-model registry.
 *
 * Checks every seat's curated pool against the live OpenRouter catalog (only
 * strictly free models survive), checks each key's remaining daily quota, and
 * persists the result in `verified_free_models`. Catalog and key checks are
 * free GET endpoints, so routine verification never spends chat quota. The
 * optional latency probe does spend one request per seat and is only run when
 * the user explicitly asks for it.
 */

import { sql as dsql } from 'drizzle-orm';

import { SEATS } from '../../shared/council';
import type { CouncilStatus, QuotaSummary, SeatModelStatus } from '../../shared/types';
import { db } from '../db/client';
import { verifiedFreeModels, type VerifiedModelRow } from '../db/schema';
import { getOpenRouterKeys } from '../env';
import {
  clearCooldown,
  clearKeyExhaustion,
  coolDown,
  describeKey,
  isCoolingDown,
  isKeyExhausted,
  markKeyExhausted,
  nextUtcMidnight,
} from './health';
import { isKeyless, seatPool, unique } from './pools';
import { streamOpenRouter } from './providers';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const KEY_URL = 'https://openrouter.ai/api/v1/auth/key';
const TTL_MS = 5 * 60_000;
const KEY_TTL_MS = 60_000;

export interface OpenRouterModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number | null;
  created?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

interface KeyStatus {
  ok: boolean;
  remaining: number | null;
  limit: number | null;
  exhausted: boolean;
}

export interface SeatConfig {
  seatId: string;
  agentName: string;
  provider: string;
  primaryModel: string;
  fallbackModels: string[];
  isAvailable: boolean;
  latencyMs: number | null;
  verifiedAt: Date;
}

interface RegistryState {
  catalog: { at: number; models: Map<string, OpenRouterModel> } | null;
  seats: { at: number; configs: SeatConfig[] } | null;
  keys: { at: number; statuses: KeyStatus[] } | null;
  inflight: Promise<SeatConfig[]> | null;
}

const g = globalThis as unknown as { __traRegistry?: RegistryState };
const state: RegistryState = (g.__traRegistry ??= { catalog: null, seats: null, keys: null, inflight: null });

/* Catalog ------------------------------------------------------------------ */

function isStrictlyFree(model: OpenRouterModel): boolean {
  const prompt = Number(model.pricing?.prompt ?? -1);
  const completion = Number(model.pricing?.completion ?? -1);
  return (prompt === 0 && completion === 0) || model.id.endsWith(':free');
}

export async function fetchCatalog(force = false): Promise<Map<string, OpenRouterModel> | null> {
  if (!force && state.catalog && Date.now() - state.catalog.at < TTL_MS) return state.catalog.models;
  try {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload: any = await res.json();
    const models = new Map<string, OpenRouterModel>();
    for (const m of payload?.data ?? []) if (m?.id) models.set(m.id, m);
    state.catalog = { at: Date.now(), models };
    return models;
  } catch (err) {
    console.warn('[registry] catalog fetch failed:', (err as Error).message);
    return state.catalog?.models ?? null;
  }
}

/* Keys --------------------------------------------------------------------- */

export async function checkKeys(force = false): Promise<KeyStatus[]> {
  if (!force && state.keys && Date.now() - state.keys.at < KEY_TTL_MS) return state.keys.statuses;
  const keys = getOpenRouterKeys();
  const statuses = await Promise.all(
    keys.map(async (key): Promise<KeyStatus> => {
      try {
        const res = await fetch(KEY_URL, {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) markKeyExhausted(key, nextUtcMidnight());
          console.warn(`[registry] key ${describeKey(key)} check failed: HTTP ${res.status}`);
          return { ok: false, remaining: null, limit: null, exhausted: res.status === 401 || res.status === 403 };
        }
        const data: any = (await res.json().catch(() => null))?.data ?? {};
        const daily = data.free_model_daily_requests ?? {};
        const limit = typeof daily.limit === 'number' ? daily.limit : null;
        const used = typeof daily.used === 'number' ? daily.used : null;
        const remaining =
          typeof daily.remaining === 'number'
            ? daily.remaining
            : limit !== null && used !== null
              ? Math.max(0, limit - used)
              : null;
        const exhausted = remaining === 0;
        if (exhausted) markKeyExhausted(key, nextUtcMidnight());
        else clearKeyExhaustion(key);
        return { ok: true, remaining, limit, exhausted };
      } catch (err) {
        console.warn(`[registry] key ${describeKey(key)} check failed:`, (err as Error).message);
        return { ok: false, remaining: null, limit: null, exhausted: isKeyExhausted(key) };
      }
    }),
  );
  state.keys = { at: Date.now(), statuses };
  return statuses;
}

function summarizeQuota(statuses: KeyStatus[]): QuotaSummary {
  const known = statuses.filter((s) => s.remaining !== null);
  return {
    configuredKeys: getOpenRouterKeys().length,
    healthyKeys: statuses.filter((s) => s.ok && !s.exhausted).length,
    remaining: known.length ? known.reduce((sum, s) => sum + (s.remaining ?? 0), 0) : null,
    limit: known.length ? known.reduce((sum, s) => sum + (s.limit ?? 0), 0) : null,
  };
}

/* Seats -------------------------------------------------------------------- */

function rowToConfig(row: VerifiedModelRow): SeatConfig {
  return {
    seatId: row.seatId,
    agentName: row.agentName,
    provider: row.provider,
    primaryModel: row.primaryModel,
    fallbackModels: Array.isArray(row.fallbackModels) ? row.fallbackModels : [],
    isAvailable: row.isAvailable,
    latencyMs: row.latencyMs ?? null,
    verifiedAt: new Date(row.verifiedAt),
  };
}

async function loadPersisted(): Promise<SeatConfig[]> {
  try {
    return (await db.select().from(verifiedFreeModels)).map(rowToConfig);
  } catch (err) {
    console.warn('[registry] could not read verified_free_models:', (err as Error).message);
    return [];
  }
}

async function persist(configs: SeatConfig[]): Promise<void> {
  if (!configs.length) return;
  await db
    .insert(verifiedFreeModels)
    .values(configs.map((c) => ({ ...c, isFree: true })))
    .onConflictDoUpdate({
      target: verifiedFreeModels.seatId,
      set: {
        agentName: dsql`excluded.agent_name`,
        primaryModel: dsql`excluded.primary_model`,
        fallbackModels: dsql`excluded.fallback_models`,
        provider: dsql`excluded.provider`,
        isAvailable: dsql`excluded.is_available`,
        latencyMs: dsql`excluded.latency_ms`,
        verifiedAt: dsql`excluded.verified_at`,
      },
    });
  state.seats = { at: Date.now(), configs };
}

/** Cached seat configs (memory → DB). Never throws. */
export async function getSeatConfigs(): Promise<SeatConfig[]> {
  if (state.seats && Date.now() - state.seats.at < TTL_MS) return state.seats.configs;
  const persisted = await loadPersisted();
  if (persisted.length) state.seats = { at: Date.now(), configs: persisted };
  return persisted;
}

async function runVerification(): Promise<SeatConfig[]> {
  const [catalog, previous] = await Promise.all([fetchCatalog(true), getSeatConfigs(), checkKeys(true)]);
  const previousBySeat = new Map(previous.map((c) => [c.seatId, c]));
  const verifiedAt = new Date();

  const configs = SEATS.map((seat): SeatConfig => {
    const pool = unique(seatPool(seat.id));
    const keyless = pool.filter(isKeyless);
    const routed = pool.filter((m) => !isKeyless(m));
    let verified = catalog ? routed.filter((id) => catalog.has(id) && isStrictlyFree(catalog.get(id)!)) : routed;
    if (!verified.length) verified = routed; // never leave a seat empty

    const prev = previousBySeat.get(seat.id);
    // Keep a previously verified primary while it is still free, so the seat stays stable.
    const ordered =
      prev && verified.includes(prev.primaryModel)
        ? unique([prev.primaryModel, ...verified, ...keyless])
        : unique([...verified, ...keyless]);

    return {
      seatId: seat.id,
      agentName: seat.name,
      provider: seat.provider,
      primaryModel: ordered[0],
      fallbackModels: ordered.slice(1),
      isAvailable: ordered.some((m) => !isCoolingDown(m)),
      latencyMs: prev?.latencyMs ?? null,
      verifiedAt,
    };
  });

  await persist(configs);
  console.log(`[registry] verified: ${configs.map((c) => `${c.seatId}→${c.primaryModel}`).join(', ')}`);
  return configs;
}

/** Zero-chat-cost verification; concurrent callers share one run. */
export function verifySeats(): Promise<SeatConfig[]> {
  state.inflight ??= runVerification().finally(() => {
    state.inflight = null;
  });
  return state.inflight;
}

/** Fire-and-forget verification used after sign-in. */
export function verifyInBackground(): void {
  verifySeats().catch((err) => console.warn('[registry] background verification failed:', err?.message));
}

/**
 * Sends one tiny request to each seat's primary model to measure latency.
 * Costs up to 3 free requests, so it only runs on explicit user request.
 */
export async function probeSeats(): Promise<SeatConfig[]> {
  const configs = await verifySeats();
  const key = getOpenRouterKeys().find((k) => !isKeyExhausted(k));
  if (!key) return configs;

  const probed = await Promise.all(
    configs.map(async (config) => {
      const model = config.primaryModel;
      if (isKeyless(model)) return config;
      const outcome = await streamOpenRouter(key, {
        model,
        messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
        maxTokens: 96,
        temperature: 0,
        totalTimeoutMs: 15_000,
      });
      if (outcome.ok) {
        clearCooldown(model);
        return { ...config, latencyMs: outcome.latencyMs, isAvailable: true };
      }
      if (outcome.kind === 'daily_quota') markKeyExhausted(key, outcome.resetAt);
      else if (outcome.kind !== 'aborted') coolDown(model, `probe: ${outcome.message}`, 2 * 60_000);
      return config;
    }),
  );
  await persist(probed);
  return probed;
}

/** Ordered candidate list for a seat: verified order first, curated pool as backup. */
export async function getSeatCandidates(seatId: string): Promise<string[]> {
  const configs = await getSeatConfigs();
  const config = configs.find((c) => c.seatId === seatId);
  return unique([config?.primaryModel, ...(config?.fallbackModels ?? []), ...seatPool(seatId)]);
}

export async function getCouncilStatus(): Promise<CouncilStatus> {
  const [configs, statuses, catalog] = await Promise.all([
    getSeatConfigs().then((c) => (c.length ? c : verifySeats())),
    checkKeys(),
    fetchCatalog(),
  ]);

  const seats: SeatModelStatus[] = SEATS.map((seat) => {
    const config = configs.find((c) => c.seatId === seat.id);
    const all = unique([config?.primaryModel ?? seat.defaultModel, ...(config?.fallbackModels ?? [])]);
    return {
      seatId: seat.id,
      agentName: seat.name,
      provider: seat.provider,
      primaryModel: all[0],
      fallbackModels: all.slice(1),
      isAvailable: all.some((m) => !isCoolingDown(m)),
      latencyMs: config?.latencyMs ?? null,
      verifiedAt: config ? config.verifiedAt.toISOString() : null,
      coolingModels: all.filter(isCoolingDown),
    };
  });

  return {
    seats,
    quota: summarizeQuota(statuses),
    catalogSize: catalog?.size ?? null,
    checkedAt: new Date().toISOString(),
  };
}
