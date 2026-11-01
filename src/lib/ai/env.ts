import * as fs from 'fs';
import * as path from 'path';
import { isApiKeyQuotaExhausted } from './model-cooldown';

/**
 * Multi-key OpenRouter configuration.
 *
 * A single free-tier OpenRouter account is capped at 50 free-model requests per
 * day. Once that cap is hit, *every* `:free` model on that key returns HTTP 429
 * (`free-models-per-day`) until the next UTC day. To keep the council answering
 * we support several keys and rotate between them:
 *
 *   OPENROUTER_API_KEY="sk-or-v1-primary"
 *   OPENROUTER_FALLBACK_KEYS="sk-or-v1-backup,sk-or-v1-backup2"
 *   # or, equivalently:
 *   OPENROUTER_API_KEYS="sk-or-v1-primary,sk-or-v1-backup"
 */

/** Env vars that may hold one or more comma/space separated OpenRouter keys. */
const KEY_ENV_VARS = ['OPENROUTER_API_KEY', 'OPENROUTER_API_KEYS', 'OPENROUTER_FALLBACK_KEYS'] as const;

interface EnvFileCache {
  mtimeMs: number;
  values: Record<string, string>;
}

let envFileCache: EnvFileCache | null = null;

/** Candidate `.env` locations (cwd first, then the project root next to `src/`). */
function envFileCandidates(): string[] {
  const candidates = [path.resolve(process.cwd(), '.env')];
  try {
    candidates.push(path.resolve(__dirname, '../../.env'));
    candidates.push(path.resolve(__dirname, '../../../.env'));
  } catch {
    // __dirname is unavailable in some bundlers; the cwd candidate still works.
  }
  return Array.from(new Set(candidates));
}

/** Parses `KEY="value"` / `KEY=value` lines out of the first readable `.env`. */
function readEnvFile(): Record<string, string> {
  for (const envPath of envFileCandidates()) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const stat = fs.statSync(envPath);
      if (envFileCache && envFileCache.mtimeMs === stat.mtimeMs) {
        return envFileCache.values;
      }

      const values: Record<string, string> = {};
      for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        values[match[1].toUpperCase()] = value;
      }

      envFileCache = { mtimeMs: stat.mtimeMs, values };
      return values;
    } catch {
      // Try the next candidate.
    }
  }
  return envFileCache?.values ?? {};
}

/** Splits a raw env value into individual keys (comma / whitespace / semicolon separated). */
function splitKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Returns every configured OpenRouter API key, de-duplicated and ordered with the
 * caller-supplied key first, then the primary key, then any fallbacks.
 */
export function getOpenRouterApiKeys(customApiKey?: string): string[] {
  const fromFile = readEnvFile();
  const collected: string[] = [];

  if (customApiKey && customApiKey.trim().length > 0) {
    collected.push(customApiKey.trim());
  }

  for (const name of KEY_ENV_VARS) {
    collected.push(...splitKeys(fromFile[name]));
    collected.push(...splitKeys(process.env[name]));
  }

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of collected) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/**
 * Returns the first configured OpenRouter key whose free-model daily quota is not
 * known to be exhausted. Falls back to the first configured key (so callers can
 * still surface an auth error) and finally to an empty string.
 */
export function getOpenRouterApiKey(customApiKey?: string): string {
  const keys = getOpenRouterApiKeys(customApiKey);
  if (keys.length === 0) return '';
  return keys.find((key) => !isApiKeyQuotaExhausted(key)) ?? keys[0];
}
