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
import { requestKeyless, streamOpenRouter, type ChatMessage } from './providers';
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

export async function runSeat(opts: SeatRunOptions): Promise<SeatRunResult> {
  const started = Date.now();
  const emit = opts.onEvent ?? (() => {});
  const candidates = await getSeatCandidates(opts.seatId);
  const primaryModel = candidates[0];
  const routed = orderByHealth(candidates.filter((m) => !isKeyless(m)));
  const keyless = unique([...candidates.filter(isKeyless), ...KEYLESS_LADDER]);
  const keys = getOpenRouterKeys().filter((k) => !isKeyExhausted(k));

  let announced = primaryModel;
  let attempts = 0;
  let lastError = '';
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

      switch (outcome.kind) {
        case 'daily_quota':
          // Every :free model on this key will fail the same way — next key.
          markKeyExhausted(key, outcome.resetAt);
          continue outer;
        case 'key_error':
          markKeyExhausted(key, nextUtcMidnight());
          continue outer;
        case 'rate_limit':
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
      failedModels.add(model);
    }
  }

  // Tier 2: keyless Pollinations.
  for (const model of keyless) {
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
  }

  throw new Error(
    keys.length === 0 && getOpenRouterKeys().length > 0
      ? 'Every OpenRouter key has used its free daily quota and the keyless fallback did not answer.'
      : `No free model could answer for ${opts.seatName}. Last error: ${lastError || 'unknown'}`,
  );
}
