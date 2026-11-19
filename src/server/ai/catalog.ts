/**
 * Builds the model picker catalog from the live OpenRouter catalog + Pollinations
 * keyless tier, with a 10-minute in-memory cache and a static fallback if the
 * OpenRouter catalog cannot be reached.
 */

import { SEATS } from '../../shared/council';
import { DEFAULT_MODEL_IDS, type CatalogModel, type ModelCatalog } from '../../shared/types';
import { HttpError } from '../http';
import { fetchCatalog, type OpenRouterModel } from './registry';

const CATALOG_TTL_MS = 10 * 60_000;
const PRO_PER_COMPANY = 2;
const PRO_COST_3_THRESHOLD_PER_M = 5;
const NON_CHAT_ID_RE = /(embedding|embed|image|audio|tts|guard|moderation|search-preview)/i;

const PRO_PROVIDER_SLUGS = new Set([
  'openai',
  'anthropic',
  'google',
  'meta-llama',
  'mistralai',
  'deepseek',
  'qwen',
  'x-ai',
  'moonshotai',
  'z-ai',
  'minimax',
  'amazon',
  'perplexity',
  'microsoft',
]);

const COMPANY_SLUGS: Record<string, string> = {
  'meta-llama': 'meta',
  mistralai: 'mistral',
  'x-ai': 'xai',
  moonshotai: 'moonshot',
  'z-ai': 'zai',
  'dots-studio': 'dots',
  'particle-ai': 'particle',
  inclusionai: 'inclusionai',
};

const COMPANY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  meta: 'Meta',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  xai: 'xAI',
  moonshot: 'Moonshot AI',
  zai: 'Z.ai',
  minimax: 'MiniMax',
  amazon: 'Amazon',
  perplexity: 'Perplexity',
  microsoft: 'Microsoft',
  nvidia: 'NVIDIA',
  cohere: 'Cohere',
  baidu: 'Baidu',
  inclusionai: 'inclusionAI',
  thinkingmachines: 'Thinking Machines',
  liquid: 'Liquid AI',
  recursive: 'Recursive',
  particle: 'Particle',
  dots: 'Dots Studio',
};

const POLLINATIONS_MODEL: CatalogModel = {
  id: 'pollinations/openai-fast',
  name: 'GPT-OSS 20B',
  company: 'openai',
  companyName: 'OpenAI',
  description: "OpenAI's open-weight GPT-OSS 20B. Keyless, one reply per 45 seconds.",
  contextLength: null,
  access: 'free',
  vision: false,
  cost: 1,
};

const DEFAULT_ORDER = new Map<string, number>(DEFAULT_MODEL_IDS.map((id, idx) => [id, idx]));

interface CatalogState {
  built: { at: number; catalog: ModelCatalog } | null;
  inflight: Promise<ModelCatalog> | null;
}

const g = globalThis as unknown as { __traCatalog?: CatalogState };
const state: CatalogState = (g.__traCatalog ??= { built: null, inflight: null });

function titleCase(slug: string): string {
  return (
    slug
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Other'
  );
}

export function normalizeCompany(rawSlug: string): { company: string; companyName: string } {
  const lower = rawSlug.trim().toLowerCase();
  if (lower === 'pollinations') return { company: 'openai', companyName: 'OpenAI' };
  const company = COMPANY_SLUGS[lower] ?? (lower || 'other');
  const companyName = COMPANY_NAMES[company] ?? titleCase(company);
  return { company, companyName };
}

export function companyForModelId(modelId: string): string {
  const slash = modelId.indexOf('/');
  const rawSlug = slash === -1 ? '' : modelId.slice(0, slash);
  return normalizeCompany(rawSlug).company;
}

function rawProviderSlug(modelId: string): string {
  const slash = modelId.indexOf('/');
  return (slash === -1 ? '' : modelId.slice(0, slash)).trim().toLowerCase();
}

function normalizeModelName(rawName: string | undefined, id: string): string {
  const cleaned = (rawName ?? '')
    .trim()
    .replace(/^[^:]+:\s*/, '')
    .replace(/\s*\(free\)\s*$/i, '')
    .trim();
  if (cleaned) return cleaned;
  const tail = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;
  return tail.replace(/:free$/, '');
}

function clamp90(text: string): string {
  if (text.length <= 90) return text;
  const head = text.slice(0, 90);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace > 45 ? head.slice(0, lastSpace) : text.slice(0, 89);
  return `${cut.replace(/[,;:\-–—.]+$/, '').trim()}…`;
}

function normalizeDescription(raw: string | undefined, name: string, companyName: string): string {
  let text = (raw ?? '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[`*_~#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return clamp90(`${name} by ${companyName}.`);

  // Use the first sentence that describes the model, skipping editorial
  // asides such as "Note: …" / "See details here." that some listings start with.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const useful = sentences.find((s) => !/^(note|see|exclusively available|disclaimer)\b/i.test(s) && s.length > 12);
  if (useful && !useful.endsWith('..')) {
    text = useful;
  }
  text = text.replace(/\.{3}$/, '…').trim();
  return clamp90(text);
}

function isStrictlyFree(model: OpenRouterModel): boolean {
  const prompt = Number(model.pricing?.prompt ?? -1);
  const completion = Number(model.pricing?.completion ?? -1);
  return prompt === 0 && completion === 0;
}

function isTextChatOutput(model: OpenRouterModel): boolean {
  const out = model.architecture?.output_modalities;
  if (!Array.isArray(out) || out.length === 0) return true;
  return out.includes('text') && out.every((m) => m === 'text');
}

function hasVisionInput(model: OpenRouterModel): boolean {
  return Array.isArray(model.architecture?.input_modalities) && model.architecture.input_modalities.includes('image');
}

function toCatalogModel(model: OpenRouterModel, access: 'free' | 'pro'): CatalogModel {
  const { company, companyName } = normalizeCompany(rawProviderSlug(model.id));
  const name = normalizeModelName(model.name, model.id);
  const promptPerM = Number(model.pricing?.prompt ?? 0) * 1_000_000;
  const cost: 1 | 2 | 3 = access === 'free' ? 1 : promptPerM >= PRO_COST_3_THRESHOLD_PER_M ? 3 : 2;
  const contextLength = typeof model.context_length === 'number' && model.context_length > 0 ? model.context_length : null;
  return {
    id: model.id,
    name,
    company,
    companyName,
    description: normalizeDescription(model.description, name, companyName),
    contextLength,
    access,
    vision: hasVisionInput(model),
    cost,
  };
}

function sortFreeModels(models: CatalogModel[]): CatalogModel[] {
  return [...models].sort((a, b) => {
    const ai = DEFAULT_ORDER.get(a.id);
    const bi = DEFAULT_ORDER.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return (
      a.companyName.localeCompare(b.companyName) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
    );
  });
}

function buildStaticFallback(fetchedAt: string): ModelCatalog {
  const defaultsList: CatalogModel[] = DEFAULT_MODEL_IDS.map((id) => {
    const seat = SEATS.find((s) => s.defaultModel === id);
    const { company, companyName } = normalizeCompany(rawProviderSlug(id));
    const name = seat ? normalizeModelName(seat.name, id) : normalizeModelName(undefined, id);
    const description = clamp90(seat?.blurb ?? `${name} by ${companyName}.`);
    return {
      id,
      name,
      company,
      companyName,
      description,
      contextLength: null,
      access: 'free',
      vision: false,
      cost: 1,
    };
  });
  const models = sortFreeModels([...defaultsList, POLLINATIONS_MODEL]);
  return {
    models,
    defaults: [...DEFAULT_MODEL_IDS],
    fetchedAt,
  };
}

function buildCatalogFromOpenRouter(rawModels: Map<string, OpenRouterModel>, fetchedAt: string): ModelCatalog {
  const freeOr: CatalogModel[] = [];
  const proByProvider = new Map<string, { model: CatalogModel; created: number }[]>();

  for (const raw of rawModels.values()) {
    const id = raw.id;
    if (!id || id.startsWith('~') || id.startsWith('openrouter/')) continue;
    if (!isTextChatOutput(raw)) continue;

    if (isStrictlyFree(raw)) {
      freeOr.push(toCatalogModel(raw, 'free'));
      continue;
    }

    const provider = rawProviderSlug(id);
    if (!PRO_PROVIDER_SLUGS.has(provider)) continue;
    if (id.includes(':')) continue;
    if (NON_CHAT_ID_RE.test(id)) continue;

    const prompt = Number(raw.pricing?.prompt ?? -1);
    const completion = Number(raw.pricing?.completion ?? -1);
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;

    const list = proByProvider.get(provider) ?? [];
    list.push({ model: toCatalogModel(raw, 'pro'), created: typeof raw.created === 'number' ? raw.created : 0 });
    proByProvider.set(provider, list);
  }

  const freeModels = sortFreeModels([...freeOr, POLLINATIONS_MODEL]);

  const proEntries: { model: CatalogModel; created: number }[] = [];
  for (const candidates of proByProvider.values()) {
    candidates.sort((a, b) => b.created - a.created || a.model.id.localeCompare(b.model.id));
    proEntries.push(...candidates.slice(0, PRO_PER_COMPANY));
  }
  proEntries.sort(
    (a, b) =>
      a.model.companyName.localeCompare(b.model.companyName) ||
      b.created - a.created ||
      a.model.name.localeCompare(b.model.name),
  );
  const proModels = proEntries.map((e) => e.model);

  const freeIds = new Set(freeModels.map((m) => m.id));
  const matchedDefaults = DEFAULT_MODEL_IDS.filter((id) => freeIds.has(id));
  const defaults = matchedDefaults.length > 0 ? matchedDefaults : freeModels.slice(0, 3).map((m) => m.id);

  return {
    models: [...freeModels, ...proModels],
    defaults,
    fetchedAt,
  };
}

async function computeModelCatalog(force: boolean): Promise<ModelCatalog> {
  const fetchedAt = new Date().toISOString();
  const rawModels = await fetchCatalog(force);
  if (!rawModels || rawModels.size === 0) {
    return buildStaticFallback(fetchedAt);
  }
  const built = buildCatalogFromOpenRouter(rawModels, fetchedAt);
  if (built.models.some((m) => m.access === 'free' && m.id !== POLLINATIONS_MODEL.id)) {
    state.built = { at: Date.now(), catalog: built };
    return built;
  }
  return buildStaticFallback(fetchedAt);
}

/** Returns the cached (~10 min) model picker catalog, falling back safely if OpenRouter fails. */
export async function getModelCatalog(force = false): Promise<ModelCatalog> {
  if (!force && state.built && Date.now() - state.built.at < CATALOG_TTL_MS) {
    return state.built.catalog;
  }
  if (!force && state.inflight) return state.inflight;
  const task = computeModelCatalog(force).finally(() => {
    if (state.inflight === task) state.inflight = null;
  });
  state.inflight = task;
  return task;
}

/**
 * Resolves the models for a council turn: uses `catalog.defaults` when omitted,
 * and rejects unknown or pro-only models with a 400 before streaming begins.
 */
export async function resolveChosenModels(requestedIds?: string[]): Promise<CatalogModel[]> {
  const catalog = await getModelCatalog();
  const byId = new Map(catalog.models.map((m) => [m.id, m]));
  const ids = requestedIds ?? catalog.defaults;
  return ids.map((id) => {
    const entry = byId.get(id);
    if (!entry || entry.access !== 'free') {
      throw new HttpError(400, `“${entry?.name ?? id}” isn't available on the free plan. Pick another model.`);
    }
    return entry;
  });
}
