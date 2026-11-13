import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type {
  CouncilEvent,
  CouncilStatus,
  CouncilTurn,
  InsightsSummary,
  ThreadSummary,
  UserAccount,
} from '@/shared/types';

/**
 * API base URL. On web the API routes share the page's origin. On a device
 * the dev server's LAN address is derived from the Expo host URI. Set
 * EXPO_PUBLIC_API_URL to point a build at a deployed server.
 */
function baseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, '');
  if (Platform.OS === 'web') return '';
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split(':')[0]}:8081`;
  return 'http://localhost:8081';
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (authToken) h.Authorization = `Bearer ${authToken}`;
  return h;
}

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: init.method ?? 'GET',
      headers: headers(),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  }
  return data as T;
}

export const api = {
  signIn: (email: string, password: string) =>
    request<{ token: string; user: UserAccount }>('/api/auth/login', { method: 'POST', body: { email, password } }),
  signUp: (email: string, password: string, fullName: string) =>
    request<{ token: string; user: UserAccount }>('/api/auth/signup', {
      method: 'POST',
      body: { email, password, fullName },
    }),
  signOut: (everywhere = false) => request<{ ok: true }>('/api/auth/logout', { method: 'POST', body: { everywhere } }),
  me: () => request<{ user: UserAccount }>('/api/auth/me'),
  updateProfile: (fullName: string) =>
    request<{ user: UserAccount }>('/api/auth/me', { method: 'PATCH', body: { fullName } }),

  threads: (q?: string) =>
    request<{ threads: ThreadSummary[] }>(`/api/threads${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  thread: (id: string) =>
    request<{ thread: ThreadSummary; turns: CouncilTurn[] }>(`/api/threads/${encodeURIComponent(id)}/messages`),
  updateThread: (id: string, changes: { title?: string; pinned?: boolean }) =>
    request<{ thread: ThreadSummary }>(`/api/threads/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }),
  deleteThread: (id: string) =>
    request<{ ok: true }>(`/api/threads/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  vote: (turnId: string, preferredAgentId: string | null) =>
    request<{ turn: CouncilTurn }>(`/api/turns/${encodeURIComponent(turnId)}`, {
      method: 'PATCH',
      body: { preferredAgentId },
    }),
  synthesize: (turnId: string) =>
    request<{ turn: CouncilTurn }>(`/api/turns/${encodeURIComponent(turnId)}/synthesize`, { method: 'POST', body: {} }),

  councilStatus: () => request<CouncilStatus>('/api/models'),
  verifyCouncil: (action: 'verify' | 'probe') =>
    request<CouncilStatus>('/api/models', { method: 'POST', body: { action } }),
  insights: () => request<InsightsSummary>('/api/insights'),
};

/**
 * Starts a council turn and calls `onEvent` for every NDJSON event as it
 * streams in. Uses `expo/fetch`, which supports streamed bodies on native.
 */
export async function streamCouncil(
  body: { prompt: string; threadId?: string; useContext: boolean },
  opts: { signal: AbortSignal; onEvent: (event: CouncilEvent) => void },
): Promise<void> {
  let res;
  try {
    res = await expoFetch(`${baseUrl()}/api/council`, {
      method: 'POST',
      headers: { ...headers(), Accept: 'application/x-ndjson' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch {
    if (opts.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    if (res.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  }

  const reader = res.body.getReader();
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
      if (!line) continue;
      try {
        opts.onEvent(JSON.parse(line) as CouncilEvent);
      } catch {
        // ignore a malformed line rather than killing the stream
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      opts.onEvent(JSON.parse(tail) as CouncilEvent);
    } catch {
      // ignore
    }
  }
}
