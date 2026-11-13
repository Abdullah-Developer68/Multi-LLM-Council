import type { z } from 'zod';

import { ensureSchema } from './db/bootstrap';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Parses and validates a JSON body, throwing a 400 on bad input. */
export async function readBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid input.');
  }
  return parsed.data;
}

export function param(params: Record<string, string | string[]> | undefined, name: string): string {
  const value = params?.[name];
  const single = Array.isArray(value) ? value[0] : value;
  if (!single) throw new HttpError(400, `Missing route parameter: ${name}`);
  return decodeURIComponent(single);
}

type Handler = (request: Request, params: Record<string, string | string[]>) => Promise<Response>;

/**
 * Wraps an API route handler: ensures the schema exists, converts thrown
 * HttpErrors into JSON responses, and hides unexpected internals behind a 500.
 */
export function route(handler: Handler): Handler {
  return async (request, params) => {
    try {
      await ensureSchema();
      return await handler(request, params ?? {});
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status);
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} failed:`, err);
      return json({ error: 'Something went wrong on the server. Please try again.' }, 500);
    }
  };
}
