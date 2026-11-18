import { isDailyQuotaError, isRateLimitError, parseResetHeader } from './health';
import { KEYLESS_PREFIX } from './pools';

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const POLLINATIONS_CHAT_URL = 'https://text.pollinations.ai/openai';
const POLLINATIONS_DEFAULT_MODEL = 'openai-fast';
const APP_TITLE = 'TRA Council';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface AttemptOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Abort if no token (answer or reasoning) arrives within this window. */
  firstTokenTimeoutMs?: number;
  /** Hard cap for the whole attempt. */
  totalTimeoutMs?: number;
  /** Outer cancellation (e.g. the client disconnected). */
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onThinking?: () => void;
}

export type FailureKind =
  | 'daily_quota'
  | 'key_error'
  | 'rate_limit'
  | 'unknown_model'
  | 'empty'
  | 'timeout'
  | 'aborted'
  | 'error';

export type AttemptOutcome =
  | { ok: true; text: string; latencyMs: number; streamed: boolean }
  | { ok: false; kind: FailureKind; message: string; resetAt?: number; emitted: boolean };

/** Links an outer signal and timeouts into one controller we can inspect. */
function createAttemptController(opts: AttemptOptions) {
  const controller = new AbortController();
  let reason: 'timeout' | 'aborted' | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const abort = (why: 'timeout' | 'aborted') => {
    if (!reason) reason = why;
    controller.abort();
  };

  const onOuterAbort = () => abort('aborted');
  if (opts.signal?.aborted) abort('aborted');
  opts.signal?.addEventListener('abort', onOuterAbort);

  let firstTokenTimer: ReturnType<typeof setTimeout> | null = null;
  if (opts.firstTokenTimeoutMs) {
    firstTokenTimer = setTimeout(() => abort('timeout'), opts.firstTokenTimeoutMs);
    timers.push(firstTokenTimer);
  }
  if (opts.totalTimeoutMs) timers.push(setTimeout(() => abort('timeout'), opts.totalTimeoutMs));

  return {
    signal: controller.signal,
    gotFirstToken() {
      if (firstTokenTimer) clearTimeout(firstTokenTimer);
      firstTokenTimer = null;
    },
    get reason() {
      return reason;
    },
    dispose() {
      timers.forEach(clearTimeout);
      opts.signal?.removeEventListener('abort', onOuterAbort);
    },
  };
}

function failure(kind: FailureKind, message: string, emitted = false, resetAt?: number): AttemptOutcome {
  return { ok: false, kind, message: message.slice(0, 240), emitted, resetAt };
}

function classifyHttp(status: number, body: string, resetHeader: string | null): AttemptOutcome {
  if (isDailyQuotaError(body)) return failure('daily_quota', `HTTP ${status}: ${body}`, false, parseResetHeader(resetHeader));
  if (status === 401 || status === 403) return failure('key_error', `HTTP ${status}: ${body}`);
  if (status === 404) return failure('unknown_model', `HTTP 404: ${body}`);
  if (isRateLimitError(body, status)) return failure('rate_limit', `HTTP ${status}: ${body}`);
  return failure('error', `HTTP ${status}: ${body}`);
}

/** A tiny answer that is really an upstream complaint ("rate limit exceeded", …). */
function looksLikeUpstreamComplaint(text: string): boolean {
  return text.length < 160 && isRateLimitError(text);
}

/**
 * Streams one OpenRouter chat completion (SSE), forwarding answer tokens via
 * `onDelta`. Reasoning tokens are not forwarded (they only trigger
 * `onThinking`); a reply with reasoning but no answer counts as a failure so
 * the seat fails over rather than showing scratch work.
 */
export async function streamOpenRouter(apiKey: string, opts: AttemptOptions): Promise<AttemptOutcome> {
  const started = Date.now();
  const ctl = createAttemptController(opts);
  let content = '';
  let reasoning = '';
  let thinkingAnnounced = false;

  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:8081',
        'X-Title': APP_TITLE,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2000,
        // Keep reasoning models from spending the whole budget thinking.
        reasoning: { effort: 'low', exclude: false },
        stream: true,
      }),
      signal: ctl.signal,
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      return classifyHttp(response.status, body, response.headers.get('x-ratelimit-reset'));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue; // SSE comments / keep-alives
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;

        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        if (chunk?.error) {
          const message = String(chunk.error.message ?? JSON.stringify(chunk.error));
          const emitted = content.length > 0;
          if (isDailyQuotaError(message)) return failure('daily_quota', message, emitted);
          if (isRateLimitError(message)) return failure('rate_limit', message, emitted);
          return failure('error', message, emitted);
        }

        const delta = chunk?.choices?.[0]?.delta ?? {};
        const piece: string = typeof delta.content === 'string' ? delta.content : '';
        const thought: string =
          typeof delta.reasoning === 'string'
            ? delta.reasoning
            : typeof delta.reasoning_content === 'string'
              ? delta.reasoning_content
              : '';

        if (thought) {
          ctl.gotFirstToken();
          reasoning += thought;
          if (!thinkingAnnounced && !content) {
            thinkingAnnounced = true;
            opts.onThinking?.();
          }
        }
        if (piece) {
          ctl.gotFirstToken();
          content += piece;
          opts.onDelta?.(piece);
        }
      }
    }

    const answer = content.trim();
    if (!answer) {
      // A reasoning-only reply is the model's scratch work, not an answer — fail over.
      return failure(
        'empty',
        reasoning.trim()
          ? `${opts.model} used its token budget on reasoning without answering`
          : `${opts.model} returned an empty response`,
        false,
      );
    }
    if (looksLikeUpstreamComplaint(answer)) return failure('rate_limit', answer, true);
    return { ok: true, text: answer, latencyMs: Date.now() - started, streamed: true };
  } catch (err) {
    const emitted = content.length > 0;
    if (ctl.reason === 'aborted') return failure('aborted', 'Request cancelled', emitted);
    if (ctl.reason === 'timeout') return failure('timeout', `${opts.model} timed out`, emitted);
    return failure('error', String((err as Error)?.message ?? err), emitted);
  } finally {
    ctl.dispose();
  }
}

async function requestPollinations(model: string, opts: AttemptOptions): Promise<AttemptOutcome> {
  const started = Date.now();
  const ctl = createAttemptController(opts);
  try {
    const response = await fetch(POLLINATIONS_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2000,
        referrer: APP_TITLE,
      }),
      signal: ctl.signal,
    });
    const raw = await response.text().catch(() => '');

    if (!response.ok) {
      if (response.status === 404 || raw.includes('NOT_FOUND') || raw.toLowerCase().includes('classic api')) {
        return failure('unknown_model', `HTTP ${response.status}: ${raw}`);
      }
      if (isRateLimitError(raw, response.status)) return failure('rate_limit', `HTTP ${response.status}: ${raw}`);
      return failure('error', `Pollinations HTTP ${response.status}: ${raw}`);
    }

    let text = raw;
    try {
      const data = JSON.parse(raw);
      if (data?.error) return failure('error', String(data.error.message ?? JSON.stringify(data.error)));
      const msg = data?.choices?.[0]?.message;
      text = String(msg?.content || msg?.reasoning_content || msg?.reasoning || '');
    } catch {
      // Some deployments answer with plain text.
    }
    text = text.trim();
    if (!text) return failure('empty', 'Pollinations returned an empty response');
    if (looksLikeUpstreamComplaint(text)) return failure('rate_limit', text);
    return { ok: true, text, latencyMs: Date.now() - started, streamed: false };
  } catch (err) {
    if (ctl.reason === 'aborted') return failure('aborted', 'Request cancelled');
    if (ctl.reason === 'timeout') return failure('timeout', `Pollinations ${model} timed out`);
    return failure('error', String((err as Error)?.message ?? err));
  } finally {
    ctl.dispose();
  }
}

/**
 * Keyless tier. The classic Pollinations API only serves a subset of model
 * ids, so unknown ids are retried against the default model.
 */
export async function requestKeyless(candidate: string, opts: AttemptOptions): Promise<AttemptOutcome> {
  const requested = candidate.startsWith(KEYLESS_PREFIX) ? candidate.slice(KEYLESS_PREFIX.length) : candidate;
  const first = await requestPollinations(requested, opts);
  if (first.ok || first.kind !== 'unknown_model' || requested === POLLINATIONS_DEFAULT_MODEL) return first;
  return requestPollinations(POLLINATIONS_DEFAULT_MODEL, opts);
}
