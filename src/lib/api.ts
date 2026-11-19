import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';
import { Platform } from 'react-native';

import type {
  AttachmentMeta,
  CouncilEvent,
  CouncilStatus,
  CouncilTurn,
  InsightsSummary,
  ModelCatalog,
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
  // The dev server serves the API routes too. Keep its exact host and port:
  // `192.168.x.x:8082` on LAN, or a tunnel host like `abc.exp.direct` (no port).
  if (hostUri) return `http://${hostUri.replace(/\/+$/, '')}`;
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

const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;

  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
  };

  if (init.signal?.aborted) {
    callerAborted = true;
    controller.abort();
  } else {
    init.signal?.addEventListener('abort', onCallerAbort, { once: true });
  }

  const timer = setTimeout(() => {
    if (!callerAborted) {
      timedOut = true;
      controller.abort();
    }
  }, init.timeoutMs ?? REQUEST_TIMEOUT_MS);

  let res: Response;
  let data: unknown;
  try {
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method: init.method ?? 'GET',
        headers: headers(),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch (err) {
      if (callerAborted) throw err;
      if (timedOut) {
        throw new ApiError(0, 'The server took too long to respond. Check your connection and try again.');
      }
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
    }

    try {
      data = await res.json();
    } catch (err) {
      if (callerAborted) throw err;
      if (timedOut) {
        throw new ApiError(0, 'The server took too long to respond. Check your connection and try again.');
      }
      data = {};
    }
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    const error = (data as { error?: string } | null)?.error;
    throw new ApiError(res.status, error ?? `Request failed (${res.status}).`);
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
  catalog: () => request<ModelCatalog>('/api/catalog'),
  insights: () => request<InsightsSummary>('/api/insights'),
};

const UPLOAD_TIMEOUT_MS = 90_000;

export interface UploadFileInput {
  uri: string;
  name: string;
  type: string;
  webFile?: File;
}

type UploadResponse = { status: number; body: string };

/**
 * Native upload via React Native's XMLHttpRequest.
 *
 * Expo SDK 58 replaces the global `fetch` with `expo/fetch`, whose FormData
 * encoder does not support React Native file parts (`{ uri, name, type }`).
 * The request then fails before it leaves the device. React Native's XHR
 * still understands those parts: it streams the file from disk and keeps the
 * original filename and MIME type, which the server uses to read the file.
 */
function xhrUpload(
  url: string,
  form: FormData,
  headers: Record<string, string>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener('abort', onAbort);

    xhr.open('POST', url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.timeout = timeoutMs;
    xhr.onload = () => {
      cleanup();
      resolve({ status: xhr.status, body: typeof xhr.responseText === 'string' ? xhr.responseText : '' });
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, 'Could not reach the server. Check your connection and try again.'));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new ApiError(408, 'Upload timed out. Please try again.'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    xhr.send(form);
  });
}

/** Web upload: a real Blob/File in FormData through the browser's fetch. */
async function webUpload(
  url: string,
  file: UploadFileInput,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<UploadResponse> {
  const form = new FormData();
  if (file.webFile) {
    form.append('file', file.webFile, file.name);
  } else {
    const blob = await (await fetch(file.uri, { signal })).blob();
    form.append('file', blob, file.name);
  }
  try {
    const res = await fetch(url, { method: 'POST', headers, body: form, signal });
    return { status: res.status, body: await res.text().catch(() => '') };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
}

/**
 * Uploads one file or photo to `POST /api/attachments` (multipart, field
 * `file`). Images can take a while because the server runs a vision model,
 * so the timeout is generous.
 */
export async function uploadAttachment(
  file: UploadFileInput,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AttachmentMeta> {
  if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onParentAbort, { once: true });

  const url = `${baseUrl()}/api/attachments`;
  const reqHeaders: Record<string, string> = { Accept: 'application/json' };
  if (authToken) reqHeaders.Authorization = `Bearer ${authToken}`;

  try {
    let response: UploadResponse;
    if (Platform.OS === 'web') {
      response = await webUpload(url, file, reqHeaders, controller.signal);
    } else {
      const form = new FormData();
      form.append('file', { uri: file.uri, name: file.name, type: file.type || 'application/octet-stream' } as unknown as Blob);
      response = await xhrUpload(url, form, reqHeaders, controller.signal, opts.timeoutMs ?? UPLOAD_TIMEOUT_MS);
    }

    let data: { attachment?: AttachmentMeta; error?: string } = {};
    try {
      data = JSON.parse(response.body);
    } catch {
      // non-JSON error page (e.g. a proxy); fall through to the status check
    }
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 401 && authToken) onUnauthorized?.();
      throw new ApiError(response.status, data?.error ?? `Upload failed (${response.status}).`);
    }
    if (!data?.attachment) {
      throw new ApiError(response.status, 'Server returned an invalid attachment response.');
    }
    return data.attachment;
  } finally {
    opts.signal?.removeEventListener('abort', onParentAbort);
  }
}

/**
 * Starts a council turn and calls `onEvent` for every NDJSON event as it
 * streams in. Uses `expo/fetch`, which supports streamed bodies on native.
 */
export async function streamCouncil(
  body: { prompt: string; threadId?: string; useContext: boolean; attachmentIds?: string[]; models?: string[] },
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
