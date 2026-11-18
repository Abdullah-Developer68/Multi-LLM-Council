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
  agentId: string;
  agentName: string;
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
  synthesis: TurnSynthesis | null;
  elapsedMs: number | null;
  /** How many earlier turns were fed to the council as context. */
  contextTurns: number;
  createdAt: string;
}

/** Events streamed (as NDJSON) from `POST /api/council`. */
export type CouncilEvent =
  | { type: 'thread'; threadId: string; title: string; created: boolean }
  | { type: 'refine:start'; model: string }
  | { type: 'refine:done'; refinement: TurnRefinement }
  | { type: 'seat:start'; seatId: string; model: string }
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
