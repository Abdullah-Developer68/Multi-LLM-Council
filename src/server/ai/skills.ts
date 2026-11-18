/**
 * Server-only loader for markdown skill instructions under `src/server/ai/skills/`.
 * Mirrors `src/server/env.ts` by caching parsed instructions keyed on file mtime.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const FALLBACK_INSTRUCTION =
  'Rewrite the user prompt so it is clear, self-contained, and explicit about goal, constraints, and output format. Preserve intent and language, never answer the prompt, and wrap the result in <refined_prompt>...</refined_prompt>.';

const cache = new Map<string, { mtimeMs: number; content: string }>();
const warnedMissing = new Set<string>();

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '').trim();
}

export function loadSkill(name: string): string {
  const file = path.resolve(process.cwd(), 'src/server/ai/skills', name, 'SKILL.md');
  try {
    const stat = fs.statSync(file);
    const cached = cache.get(name);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.content;

    const raw = fs.readFileSync(file, 'utf8');
    const content = stripFrontmatter(raw) || FALLBACK_INSTRUCTION;
    cache.set(name, { mtimeMs: stat.mtimeMs, content });
    return content;
  } catch (err) {
    if (!warnedMissing.has(name)) {
      warnedMissing.add(name);
      console.warn(`[skills] Could not load skill "${name}" at ${file}; using fallback.`, err);
    }
    return cache.get(name)?.content ?? FALLBACK_INSTRUCTION;
  }
}
