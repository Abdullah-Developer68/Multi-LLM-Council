/**
 * Types shared by the Expo client and the API routes.
 * Keep this file free of runtime imports so it is safe on both sides.
 */

export interface UserAccount {
  id: number;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
}

export type SeatTier = 'openrouter' | 'keyless';

/** One council seat's answer inside a turn. */
export interface SeatResponse {
  /** Seat id. For user-picked models this is the model id (e.g. `google/gemma-4-31b-it:free`). */
  agentId: string;
  agentName: string;
  /** Company slug for the logo (`google`, `nvidia`, …). Absent on older turns. */
  company?: string;
  /** Model that actually produced the answer (after any rotation). */
  model: string;
  answer: string;
  status: 'ok' | 'error';
  error?: string;
  latencyMs?: number;
  tier?: SeatTier;
  /** True when the seat had to rotate away from its primary model. */
  rotated?: boolean;
  /** Number of upstream attempts made before an answer arrived. */
  attempts?: number;
  optimizedByAgentId?: string;
  optimizedByAgentName?: string;
  /** The refined prompt this seat received. */
  receivedPrompt?: string;
}

export interface TurnRefinement {
  prompt: string;
  model: string;
  latencyMs: number;
  refined: boolean;
  error?: string;
}

export interface TurnSynthesis {
  text: string;
  model: string;
  latencyMs: number;
  createdAt: string;
}

export interface CouncilTurn {
  turnId: string;
  threadId: string;
  userPrompt: string;
  agentResponses: SeatResponse[];
  preferredAgentId: string | null;
  refinement: TurnRefinement | null;
  /** Files attached to the user's message (empty for older turns). */
  attachments: AttachmentMeta[];
  synthesis: TurnSynthesis | null;
  elapsedMs: number | null;
  /** How many earlier turns were fed to the council as context. */
  contextTurns: number;
  createdAt: string;
}

/** What kind of file an attachment is; drives the icon and how its contents are read. */
export type AttachmentKind = 'image' | 'pdf' | 'document' | 'presentation' | 'spreadsheet' | 'text';

/**
 * A file the user attached to a message. Uploaded with `POST /api/attachments`
 * (multipart, field `file`), which extracts its text (or, for images, a vision
 * model's description + OCR) and returns this metadata. The extracted text
 * stays on the server; a council turn references attachments by `id`.
 */
export interface AttachmentMeta {
  id: string;
  name: string;
  mimeType: string;
  /** Bytes of the original upload. */
  size: number;
  kind: AttachmentKind;
  /** Characters of extracted text the models will see. */
  chars: number;
  /** True when the extracted text was cut to fit the model context. */
  truncated: boolean;
}

/** Upload limits shared by client checks and server validation. */
export const ATTACHMENT_LIMITS = {
  maxFiles: 5,
  maxBytes: 15 * 1024 * 1024,
} as const;

/** Events streamed (as NDJSON) from `POST /api/council`. */
export type CouncilEvent =
  | { type: 'thread'; threadId: string; title: string; created: boolean }
  | { type: 'refine:start'; model: string }
  | { type: 'refine:done'; refinement: TurnRefinement }
  | { type: 'seat:start'; seatId: string; model: string; name: string; company: string }
  | { type: 'seat:thinking'; seatId: string }
  | { type: 'seat:rotate'; seatId: string; model: string; reason: string }
  | { type: 'seat:delta'; seatId: string; text: string }
  | { type: 'seat:reset'; seatId: string }
  | { type: 'seat:done'; seatId: string; response: SeatResponse }
  | { type: 'done'; turn: CouncilTurn }
  | { type: 'error'; message: string };

export interface SeatModelStatus {
  seatId: string;
  agentName: string;
  provider: string;
  primaryModel: string;
  fallbackModels: string[];
  isAvailable: boolean;
  latencyMs: number | null;
  verifiedAt: string | null;
  /** Candidate models currently cooling down after a rate limit. */
  coolingModels: string[];
}

export interface QuotaSummary {
  configuredKeys: number;
  healthyKeys: number;
  /** Remaining free-model requests today across all keys (null when unknown). */
  remaining: number | null;
  limit: number | null;
}

export interface CouncilStatus {
  seats: SeatModelStatus[];
  quota: QuotaSummary;
  catalogSize: number | null;
  checkedAt: string;
}

export interface SeatInsight {
  seatId: string;
  /** Display name and company slug of the model/seat (from its latest answer). */
  name?: string;
  company?: string;
  answered: number;
  failed: number;
  wins: number;
  avgLatencyMs: number | null;
  rotatedRate: number;
  keylessRate: number;
}

export interface InsightsSummary {
  totals: {
    threads: number;
    turns: number;
    votes: number;
    synthesized: number;
  };
  seats: SeatInsight[];
  /** Turns per day for the last 14 days, oldest first. */
  activity: { date: string; count: number }[];
}

/* Model picker ------------------------------------------------------------ */

/**
 * `free`: selectable, answered through free OpenRouter models or the keyless tier.
 * `pro`: shown locked in the picker (opens the pricing page); never sent to the council.
 */
export type ModelAccess = 'free' | 'pro';

/** One entry in the model picker, served by `GET /api/catalog`. */
export interface CatalogModel {
  /** Provider model id, e.g. `google/gemma-4-31b-it:free` or `pollinations/openai-fast`. */
  id: string;
  /** Display name without company prefix or "(free)", e.g. "Gemma 4 31B". */
  name: string;
  /** Company slug used for the logo and filter chips, e.g. `google`, `openai`, `nvidia`. */
  company: string;
  /** Company display name, e.g. "Google". */
  companyName: string;
  /** One short line describing what the model is good at. */
  description: string;
  contextLength: number | null;
  access: ModelAccess;
  /** Accepts image input. */
  vision: boolean;
  /** Relative cost hint shown like the design's £ / ££ / £££ (free models are 1). */
  cost: 1 | 2 | 3;
}

export interface ModelCatalog {
  models: CatalogModel[];
  /** Model ids selected for users who have not picked any yet. */
  defaults: string[];
  fetchedAt: string;
}

/** How many models may answer one question. */
export const MODEL_SELECTION_LIMITS = { min: 1, max: 4 } as const;

/** The three original council seats' primaries; the default selection. */
export const DEFAULT_MODEL_IDS = [
  'nvidia/nemotron-3.5-lightning:free',
  'cohere/north-mini-code:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
] as const;
