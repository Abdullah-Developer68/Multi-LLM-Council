/**
 * Runs one council seat to completion, failing over on three axes:
 *   1. model  — walk the seat's verified free-model pool,
 *   2. key    — move to the next OpenRouter key when one hits its daily cap,
 *   3. tier   — fall back to the keyless Pollinations endpoint.
 *
 * Answer tokens stream out through `onEvent` as they arrive. If an attempt
 * fails after it already streamed text, a `reset` event tells the client to
 * clear the partial answer before the next candidate starts.
 */

import { getOpenRouterKeys } from '../env';
import {
  clearCooldown,
  clearKeyExhaustion,
  coolDown,
  isKeyExhausted,
  markKeyExhausted,
  nextUtcMidnight,
  orderByHealth,
} from './health';
import { isKeyless, KEYLESS_LADDER, unique } from './pools';
import { requestKeyless, streamOpenRouter, type ChatMessage, type FailureKind } from './providers';
import { getSeatCandidates } from './registry';

const FIRST_TOKEN_MS = 20_000;
const ATTEMPT_TOTAL_MS = 90_000;
/** No new OpenRouter attempt starts after this much time on one seat. */
const OPENROUTER_WINDOW_MS = 40_000;
/** No new attempt of any kind starts after this much time on one seat. */
const SEAT_BUDGET_MS = 75_000;

export type SeatEvent =
  | { type: 'rotate'; model: string; reason: string }
  | { type: 'thinking' }
  | { type: 'delta'; text: string }
  | { type: 'reset' };

export interface SeatRunOptions {
  seatId: string;
  seatName: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  /** Override the seat's default candidate list. */
  candidates?: string[];
  /** When true, only try the given candidates (no keyless ladder or cross-model fallback). */
  strict?: boolean;
  onEvent?: (event: SeatEvent) => void;
}

export interface SeatRunResult {
  text: string;
  model: string;
  primaryModel: string;
  latencyMs: number;
  tier: 'openrouter' | 'keyless';
  rotated: boolean;
  attempts: number;
}

export class AbortedError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'AbortedError';
  }
}

export async function primaryModelFor(seatId: string): Promise<string> {
  return (await getSeatCandidates(seatId))[0];
}

function formatStrictError(
  name: string,
  openRouterKeys: { configured: number; usable: number } | null,
  lastKind: FailureKind | null,
  sawRateLimit: boolean,
): string {
  if (openRouterKeys && openRouterKeys.configured === 0) {
    return "OpenRouter isn't configured on the server. Pick GPT-OSS 20B or add an OpenRouter key.";
  }
  if (sawRateLimit || lastKind === 'rate_limit') {
    return `${name} is busy right now (rate limit). Try again or pick another model.`;
  }
  if ((openRouterKeys && openRouterKeys.usable === 0) || lastKind === 'daily_quota') {
    return 'All OpenRouter keys have reached their daily free limit. Try GPT-OSS 20B or try again tomorrow.';
  }
  switch (lastKind) {
    case 'key_error':
      return `${name} couldn't run because the OpenRouter API key was rejected.`;
    case 'timeout':
      return `${name} timed out before finishing. Try again or pick another model.`;
    case 'unknown_model':
      return `${name} is unavailable right now. Pick another model.`;
    case 'empty':
      return `${name} returned an empty response. Try again or pick another model.`;
    default:
      return `${name} couldn't answer right now. Try again or pick another model.`;
  }
}

/** Parses Pollinations' "Retry after 39s" hint from a free-tier limit response. */
function keylessRetryAfterMs(message: string): number | null {
  if (!/FREE_LIMIT|retry after/i.test(message)) return null;
  const seconds = Number(message.match(/retry after (\d+)\s*s/i)?.[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/** Abortable delay. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function runSeat(opts: SeatRunOptions): Promise<SeatRunResult> {
  const started = Date.now();
  const emit = opts.onEvent ?? (() => {});
  const candidates = opts.candidates ? unique(opts.candidates) : await getSeatCandidates(opts.seatId);
  const primaryModel = candidates[0] ?? opts.seatId;
  const routed = orderByHealth(candidates.filter((m) => !isKeyless(m)));
  const keyless = opts.strict
    ? candidates.filter(isKeyless)
    : unique([...candidates.filter(isKeyless), ...KEYLESS_LADDER]);
  const allKeys = getOpenRouterKeys();
  const keys = allKeys.filter((k) => !isKeyExhausted(k));

  let announced = primaryModel;
  let attempts = 0;
  let lastError = '';
  let lastKind: FailureKind | null = null;
  let sawRateLimit = false;
  const failedModels = new Set<string>();

  const announce = (model: string) => {
    if (model !== announced) {
      emit({ type: 'rotate', model, reason: lastError.slice(0, 140) });
      announced = model;
    }
  };
  const elapsed = () => Date.now() - started;
  const checkAborted = () => {
    if (opts.signal?.aborted) throw new AbortedError();
  };

  const finish = (text: string, model: string, latencyMs: number, tier: SeatRunResult['tier']): SeatRunResult => ({
    text,
    model,
    primaryModel,
    latencyMs,
    tier,
    rotated: model !== primaryModel,
    attempts,
  });

  // Tier 1: OpenRouter, every usable key.
  outer: for (const key of keys) {
    for (const model of routed) {
      if (failedModels.has(model)) continue;
      checkAborted();
      if (elapsed() > OPENROUTER_WINDOW_MS) break outer;

      announce(model);
      attempts++;
      const outcome = await streamOpenRouter(key, {
        model,
        messages: opts.messages,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        firstTokenTimeoutMs: FIRST_TOKEN_MS,
        totalTimeoutMs: ATTEMPT_TOTAL_MS,
        signal: opts.signal,
        onDelta: (text) => emit({ type: 'delta', text }),
        onThinking: () => emit({ type: 'thinking' }),
      });

      if (outcome.ok) {
        if (!outcome.streamed) emit({ type: 'delta', text: outcome.text });
        clearCooldown(model);
        clearKeyExhaustion(key);
        return finish(outcome.text, model, outcome.latencyMs, 'openrouter');
      }

      if (outcome.emitted) emit({ type: 'reset' });
      if (outcome.kind === 'aborted') throw new AbortedError();
      lastError = outcome.message;
      lastKind = outcome.kind;

      switch (outcome.kind) {
        case 'daily_quota':
          // Every :free model on this key will fail the same way — next key.
          markKeyExhausted(key, outcome.resetAt);
          continue outer;
        case 'key_error':
          markKeyExhausted(key, nextUtcMidnight());
          continue outer;
        case 'rate_limit':
          sawRateLimit = true;
          coolDown(model, outcome.message);
          break;
        case 'unknown_model':
          coolDown(model, outcome.message, 30 * 60_000);
          break;
        case 'timeout':
        case 'empty':
          coolDown(model, outcome.message, 2 * 60_000);
          break;
        default:
          break;
      }
      if (!opts.strict || outcome.kind === 'unknown_model') {
        failedModels.add(model);
      }
    }
  }

  // Tier 2: keyless Pollinations.
  for (const model of keyless) {
    // The anonymous tier allows one reply per ~45 s per server IP. A model the
    // user picked explicitly (strict) waits out a short limit once, if the
    // seat's time budget allows, instead of failing straight away.
    let waitedForLimit = false;
    for (;;) {
      checkAborted();
      if (elapsed() > SEAT_BUDGET_MS) break;
      announce(model);
      attempts++;
      const outcome = await requestKeyless(model, {
        messages: opts.messages,
        model,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        totalTimeoutMs: 45_000,
        signal: opts.signal,
      });
      if (outcome.ok) {
        emit({ type: 'delta', text: outcome.text });
        return finish(outcome.text, model, outcome.latencyMs, 'keyless');
      }
      if (outcome.kind === 'aborted') throw new AbortedError();
      lastError = outcome.message;
      lastKind = outcome.kind;
      if (outcome.kind === 'rate_limit') sawRateLimit = true;

      const retryAfter = keylessRetryAfterMs(outcome.message);
      if (
        opts.strict &&
        !waitedForLimit &&
        retryAfter !== null &&
        retryAfter <= 50_000 &&
        elapsed() + retryAfter < SEAT_BUDGET_MS
      ) {
        waitedForLimit = true;
        emit({ type: 'thinking' });
        await sleep(retryAfter + 1_000, opts.signal);
        continue;
      }
      break;
    }
  }

  if (opts.strict) {
    console.warn(`[rotation] ${opts.seatName} failed (${lastKind ?? 'unknown'}): ${lastError.slice(0, 300)}`);
    if (keyless.length > 0 && /FREE_LIMIT/i.test(lastError)) {
      throw new Error(`${opts.seatName} (keyless) allows one reply every 45 seconds. Try again in a minute or pick another model.`);
    }
    const openRouterKeys = routed.length > 0 && keyless.length === 0 ? { configured: allKeys.length, usable: keys.length } : null;
    throw new Error(formatStrictError(opts.seatName, openRouterKeys, lastKind, sawRateLimit));
  }

  throw new Error(
    keys.length === 0 && allKeys.length > 0
      ? 'Every OpenRouter key has used its free daily quota and the keyless fallback did not answer.'
      : `No free model could answer for ${opts.seatName}. Last error: ${lastError || 'unknown'}`,
  );
}
