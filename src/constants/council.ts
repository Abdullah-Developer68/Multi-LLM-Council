import { COUNCIL_AGENTS } from '../lib/ai/agents';

export const ALL_MODELS_VIEW = 'all_models';

export interface CouncilMeta {
  id: string;
  name: string;
}

export const COUNCIL_META: CouncilMeta[] = COUNCIL_AGENTS.map((agent) => ({
  id: agent.id,
  name: agent.name,
}));

export function getCouncilIndex(agentId: string): number {
  return COUNCIL_META.findIndex((m) => m.id === agentId);
}
