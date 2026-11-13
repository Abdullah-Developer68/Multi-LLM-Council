import { and, asc, eq } from 'drizzle-orm';

import type { CouncilTurn, ThreadSummary } from '../shared/types';
import { db } from './db/client';
import { chatThreads, multiAgentTurns, type ThreadRow, type TurnRow } from './db/schema';
import { HttpError } from './http';

/** Maps a DB row (v1 or v2) to the client shape. */
export function toCouncilTurn(row: TurnRow): CouncilTurn {
  const meta = row.meta ?? {};
  const responses = (row.agentResponses ?? []).map((r) => {
    // v1 rows have no status; their failures start with this heading.
    const failed = r.status === 'error' || (!r.status && r.answer?.startsWith('### Live Model Error'));
    return { ...r, status: failed ? ('error' as const) : ('ok' as const) };
  });
  return {
    turnId: row.id,
    threadId: row.threadId,
    userPrompt: row.userPrompt,
    agentResponses: responses,
    preferredAgentId: meta.preferredAgentId ?? null,
    synthesis: meta.synthesis ?? null,
    elapsedMs: meta.elapsedMs ?? null,
    contextTurns: meta.contextTurns ?? 0,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toThreadSummary(row: ThreadRow, turnCount = 0): ThreadSummary {
  return {
    id: row.id,
    title: row.title,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    turnCount,
  };
}

/** Loads a thread the user owns, or throws 404 (never reveals other users' threads). */
export async function requireOwnedThread(threadId: string, accountId: number): Promise<ThreadRow> {
  const [thread] = await db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.accountId, accountId)))
    .limit(1);
  if (!thread) throw new HttpError(404, 'Conversation not found.');
  return thread;
}

/** Loads a turn whose thread the user owns, or throws 404. */
export async function requireOwnedTurn(turnId: string, accountId: number): Promise<TurnRow> {
  const [row] = await db
    .select({ turn: multiAgentTurns })
    .from(multiAgentTurns)
    .innerJoin(chatThreads, eq(multiAgentTurns.threadId, chatThreads.id))
    .where(and(eq(multiAgentTurns.id, turnId), eq(chatThreads.accountId, accountId)))
    .limit(1);
  if (!row) throw new HttpError(404, 'Answer not found.');
  return row.turn;
}

export async function listThreadTurns(threadId: string): Promise<TurnRow[]> {
  return db
    .select()
    .from(multiAgentTurns)
    .where(eq(multiAgentTurns.threadId, threadId))
    .orderBy(asc(multiAgentTurns.createdAt));
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** First line of the prompt, cut on a word boundary. */
export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split('\n')[0].replace(/\s+/g, ' ');
  if (line.length <= 52) return line || 'New conversation';
  const cut = line.slice(0, 52);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 30 ? cut.lastIndexOf(' ') : 52)}…`;
}
