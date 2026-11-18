import type { LiveSeat } from '@/store/types';
import type { SeatResponse, SeatTier } from '@/shared/types';

/** A single shape for rendering a seat, whether it is streaming or finished. */
export interface SeatView {
  seatId: string;
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
  return {
    seatId: r.agentId,
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
  return {
    seatId: s.seatId,
    phase: s.status,
    model: s.model,
    text: s.text,
    rotations: s.rotations,
  };
}
