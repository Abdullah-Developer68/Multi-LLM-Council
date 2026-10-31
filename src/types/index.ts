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
