export interface UserAccount {
  id: number;
  email: string;
  fullName: string;
  createdAt: string | Date;
}

export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

/** A council seat's OpenRouter model configuration verified against the live catalog. */
export interface VerifiedModelConfig {
  seatId: string;
  agentName: string;
  primaryModel: string;
  fallbackModels: string[];
  provider: string;
  isFree: boolean;
  isAvailable: boolean;
  latencyMs: number | null;
  verifiedAt: string;
}

export interface AgentResponseItem {
  agentId: string;
  agentName: string;
  model: string;
  role: string;
  avatarIcon: string;
  answer: string;
  accuracyScore: number;
  confidence: number;
  reasoningSteps: string[];
  critiqueOfOthers?: string;
  rank: number;
  optimizedByAgentId?: string;
  optimizedByAgentName?: string;
  receivedPrompt?: string;
  /** Wall-clock time spent generating this seat's answer (ms). */
  latencyMs?: number;
}

export interface PromptOptimizationDetails {
  appliedTechniques: string[];
  intentSummary: string;
  constraintsAdded: string[];
  reasoningFramework: string;
}

export interface DiscussionRoundItem {
  speaker: string;
  targetAgent?: string;
  statement: string;
  type: 'critique' | 'endorsement' | 'rebuttal' | 'synthesis';
}

export interface MultiAgentTurn {
  turnId: string;
  threadId: string;
  userPrompt: string;
  optimizedPrompt: string;
  optimizationDetails?: PromptOptimizationDetails;
  consensusSolution: string;
  consensusRationale?: string;
  agentResponses: AgentResponseItem[];
  discussionRounds?: DiscussionRoundItem[];
  rankedAgentIds?: string[];
  createdAt: string;
}

export type PipelineStage =
  | 'idle'
  | 'optimizing'
  | 'queryingAgents'
  | 'synthesizing'
  | 'complete'
  | 'error';
