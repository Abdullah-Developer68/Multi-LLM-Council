import { sql } from 'drizzle-orm';

import { SEATS } from '../../shared/council';
import type { InsightsSummary, SeatInsight } from '../../shared/types';
import { requireUser } from '../../server/auth/session';
import { db } from '../../server/db/client';
import { json, route } from '../../server/http';

interface Row {
  created_at: string | Date;
  meta: { preferredAgentId?: string | null; synthesis?: unknown } | null;
  seats: { agentId: string; status: string | null; latencyMs: number | null; tier: string | null; rotated: boolean | null; legacyError: boolean }[] | null;
}

/** Aggregate stats over the user's last 1,000 turns. */
export const GET = route(async (request) => {
  const user = await requireUser(request);

  const result = await db.execute(sql`
    select t.created_at, t.meta,
      (select jsonb_agg(jsonb_build_object(
          'agentId', r->>'agentId',
          'status', r->>'status',
          'latencyMs', (r->>'latencyMs')::int,
          'tier', r->>'tier',
          'rotated', (r->>'rotated')::boolean,
          'legacyError', coalesce(left(r->>'answer', 19) = '### Live Model Erro', false)))
        from jsonb_array_elements(t.agent_responses) r) as seats
    from multi_agent_turns t
    join chat_threads c on c.id = t.thread_id
    where c.account_id = ${user.id}
    order by t.created_at desc
    limit 1000`);
  const rows = (Array.isArray(result) ? result : ((result as any).rows ?? [])) as Row[];

  const threadResult = await db.execute(sql`select count(*)::int as n from chat_threads where account_id = ${user.id}`);
  const threadRows = (Array.isArray(threadResult) ? threadResult : ((threadResult as any).rows ?? [])) as { n: number }[];

  const stats = new Map(
    SEATS.map((s) => [s.id, { answered: 0, failed: 0, wins: 0, latencies: [] as number[], rotated: 0, keyless: 0 }]),
  );
  let votes = 0;
  let synthesized = 0;

  const days = 14;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const activity = Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86_400_000);
    return { date: d.toISOString().slice(0, 10), count: 0 };
  });
  const activityIndex = new Map(activity.map((a, i) => [a.date, i]));

  for (const row of rows) {
    const preferred = row.meta?.preferredAgentId;
    if (preferred) {
      votes++;
      const s = stats.get(preferred);
      if (s) s.wins++;
    }
    if (row.meta?.synthesis) synthesized++;
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    const idx = activityIndex.get(day);
    if (idx !== undefined) activity[idx].count++;

    for (const seat of row.seats ?? []) {
      const s = stats.get(seat.agentId);
      if (!s) continue;
      const failed = seat.status === 'error' || (!seat.status && seat.legacyError);
      if (failed) {
        s.failed++;
        continue;
      }
      s.answered++;
      if (typeof seat.latencyMs === 'number' && seat.latencyMs > 0) s.latencies.push(seat.latencyMs);
      if (seat.rotated) s.rotated++;
      if (seat.tier === 'keyless') s.keyless++;
    }
  }

  const seats: SeatInsight[] = SEATS.map((seat) => {
    const s = stats.get(seat.id)!;
    return {
      seatId: seat.id,
      answered: s.answered,
      failed: s.failed,
      wins: s.wins,
      avgLatencyMs: s.latencies.length ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length) : null,
      rotatedRate: s.answered ? s.rotated / s.answered : 0,
      keylessRate: s.answered ? s.keyless / s.answered : 0,
    };
  });

  const summary: InsightsSummary = {
    totals: { threads: threadRows[0]?.n ?? 0, turns: rows.length, votes, synthesized },
    seats,
    activity,
  };
  return json(summary);
});
