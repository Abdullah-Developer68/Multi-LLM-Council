import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Server-side env access.
 *
 * Expo CLI loads `.env` into `process.env` for API routes, but some runtimes
 * (standalone scripts, certain dev-server reloads) don't. As a fallback we read
 * `.env` ourselves, re-parsing only when the file changes.
 */

let cache: { mtimeMs: number; values: Record<string, string> } | null = null;

function readDotEnv(): Record<string, string> {
  const candidates = [path.resolve(process.cwd(), '.env')];
  for (const file of candidates) {
    try {
      const stat = fs.statSync(file);
      if (cache && cache.mtimeMs === stat.mtimeMs) return cache.values;
      const values: Record<string, string> = {};
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
        values[match[1]] = value;
      }
      cache = { mtimeMs: stat.mtimeMs, values };
      return values;
    } catch {
      // try next candidate
    }
  }
  return cache?.values ?? {};
}

export function readEnv(name: string): string {
  // Server-only: dynamic access is fine here (nothing is inlined into the client bundle).
  // eslint-disable-next-line expo/no-dynamic-env-var
  const fromProcess = process.env[name];
  if (fromProcess && fromProcess.trim()) return fromProcess.trim();
  return (readDotEnv()[name] ?? '').trim();
}

/** Env vars that may each hold one or more comma/space separated OpenRouter keys. */
const KEY_VARS = ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS', 'OPENROUTER_FALLBACK_KEYS'];

/** Every configured OpenRouter key, de-duplicated, primary first. */
export function getOpenRouterKeys(): string[] {
  const seen = new Set<string>();
  for (const name of KEY_VARS) {
    for (const key of readEnv(name).split(/[,\s;]+/)) {
      if (key) seen.add(key);
    }
  }
  return [...seen];
}
