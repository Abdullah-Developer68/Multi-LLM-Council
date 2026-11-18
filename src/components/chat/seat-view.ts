import { getSeat } from '@/shared/council';
import type { SeatResponse, SeatTier } from '@/shared/types';
import type { LiveSeat } from '@/store/types';

/** A single shape for rendering a seat, whether it is streaming or finished. */
export interface SeatView {
  seatId: string;
  name: string;
  company?: string;
  phase: 'waiting' | 'thinking' | 'streaming' | 'done' | 'error';
  model: string;
  text: string;
  error?: string;
  latencyMs?: number;
  tier?: SeatTier;
  rotated?: boolean;
  rotations: number;
}

export function fromResponse(r: SeatResponse): SeatView {
  const legacy = getSeat(r.agentId);
  return {
    seatId: r.agentId,
    name: r.agentName || legacy?.name || r.agentId,
    company: r.company ?? legacy?.providerKey,
    phase: r.status === 'ok' ? 'done' : 'error',
    model: r.model,
    text: r.answer,
    error: r.error ?? (r.status === 'error' ? r.answer.replace(/^#+.*\n+/, '').slice(0, 300) : undefined),
    latencyMs: r.latencyMs,
    tier: r.tier,
    rotated: r.rotated,
    rotations: r.rotated ? Math.max(1, (r.attempts ?? 2) - 1) : 0,
  };
}

export function fromLive(s: LiveSeat): SeatView {
  if (s.response) return fromResponse(s.response);
  const legacy = getSeat(s.seatId);
  return {
    seatId: s.seatId,
    name: s.name || legacy?.name || s.seatId,
    company: s.company ?? legacy?.providerKey,
    phase: s.status,
    model: s.model,
    text: s.text,
    rotations: s.rotations,
  };
}
