import { api, ApiError, streamCouncil } from '@/lib/api';
import { SEATS } from '@/shared/council';
import type { CouncilEvent, CouncilTurn } from '@/shared/types';
import type { AppStore, ChatSlice, LiveSeat, LiveTurn, SliceCreator } from './types';

/**
 * Streaming state lives outside React: tokens are buffered here and flushed
 * into the store at most every FLUSH_MS, so three concurrent token streams
 * don't trigger hundreds of renders per second.
 */
const FLUSH_MS = 60;
let controller: AbortController | null = null;
let pending: Record<string, string> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function emptySeats(): Record<string, LiveSeat> {
  return Object.fromEntries(
    SEATS.map((s) => [
      s.id,
      { seatId: s.id, status: 'waiting', model: s.defaultModel, byName: '', directive: '', text: '', rotations: 0 },
    ]),
  );
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback;
}

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  const patchSeat = (liveId: string, seatId: string, patch: (seat: LiveSeat) => Partial<LiveSeat>) => {
    const live = get().live;
    if (!live || live.id !== liveId || !live.seats[seatId]) return;
    const seat = live.seats[seatId];
    set({ live: { ...live, seats: { ...live.seats, [seatId]: { ...seat, ...patch(seat) } } } });
  };

  const flush = (liveId: string) => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = null;
    const chunks = pending;
    pending = {};
    const live = get().live;
    if (!live || live.id !== liveId) return;
    const seats = { ...live.seats };
    let changed = false;
    for (const [seatId, text] of Object.entries(chunks)) {
      const seat = seats[seatId];
      if (!seat || !text) continue;
      seats[seatId] = { ...seat, text: seat.text + text, status: seat.status === 'done' ? 'done' : 'streaming' };
      changed = true;
    }
    if (changed) set({ live: { ...live, seats } });
  };

  const scheduleFlush = (liveId: string) => {
    flushTimer ??= setTimeout(() => flush(liveId), FLUSH_MS);
  };

  const finishTurn = (state: AppStore, live: LiveTurn, turn: CouncilTurn) => {
    const visible = state.activeThreadId === live.originThreadId;
    const { live: liveSelection, ...selection } = state.seatSelection;
    set({
      live: null,
      seatSelection: liveSelection ? { ...selection, [turn.turnId]: liveSelection } : selection,
      ...(visible
        ? { turns: [...state.turns, turn], activeThreadId: turn.threadId, activeTitle: live.title ?? state.activeTitle }
        : {}),
    });
    if (!visible) state.showToast(`The council answered in “${live.title ?? 'your conversation'}”`, 'success');
    void get().loadThreads();
  };

  const handleEvent = (liveId: string, event: CouncilEvent) => {
    const live = get().live;
    if (!live || live.id !== liveId) return;
    switch (event.type) {
      case 'thread':
        set({ live: { ...live, title: event.title } });
        break;
      case 'seat:start':
        patchSeat(liveId, event.seatId, () => ({
          model: event.model,
          byName: event.byName,
          directive: event.directive,
        }));
        break;
      case 'seat:thinking':
        patchSeat(liveId, event.seatId, (s) => ({ status: s.text ? s.status : 'thinking' }));
        break;
      case 'seat:rotate':
        patchSeat(liveId, event.seatId, (s) => ({ model: event.model, rotations: s.rotations + 1 }));
        break;
      case 'seat:delta':
        pending[event.seatId] = (pending[event.seatId] ?? '') + event.text;
        scheduleFlush(liveId);
        break;
      case 'seat:reset':
        delete pending[event.seatId];
        patchSeat(liveId, event.seatId, () => ({ text: '', status: 'waiting' }));
        break;
      case 'seat:done':
        flush(liveId);
        patchSeat(liveId, event.seatId, () => ({
          status: event.response.status === 'ok' ? 'done' : 'error',
          text: event.response.answer,
          model: event.response.model,
          response: event.response,
        }));
        break;
      case 'done':
        flush(liveId);
        finishTurn(get(), live, event.turn);
        break;
      case 'error':
        flush(liveId);
        set({ live: null, chatError: { message: event.message, prompt: live.prompt } });
        break;
    }
  };

  return {
    activeThreadId: null,
    activeTitle: null,
    turns: [],
    threadStatus: 'idle',
    live: null,
    chatError: null,
    draft: '',
    synthesizing: {},
    seatSelection: {},

    selectSeat: (key, index) => set({ seatSelection: { ...get().seatSelection, [key]: { index, picked: true } } }),

    openThread: async (id) => {
      const summary = get().threads.find((t) => t.id === id);
      set({ activeThreadId: id, activeTitle: summary?.title ?? null, turns: [], threadStatus: 'loading', chatError: null });
      try {
        const { thread, turns } = await api.thread(id);
        if (get().activeThreadId !== id) return;
        set({ turns, activeTitle: thread.title, threadStatus: 'ready' });
      } catch (err) {
        if (get().activeThreadId !== id) return;
        set({ threadStatus: 'error' });
        get().showToast(errorMessage(err, 'Could not open that conversation.'), 'danger');
      }
    },

    newChat: () => {
      set({ activeThreadId: null, activeTitle: null, turns: [], threadStatus: 'idle', chatError: null });
    },

    setDraft: (draft) => set({ draft }),

    send: async (raw) => {
      const prompt = raw.trim();
      if (!prompt || get().live) return;

      const liveId = `live_${Date.now()}`;
      const originThreadId = get().activeThreadId;
      const live: LiveTurn = {
        id: liveId,
        prompt,
        originThreadId,
        title: get().activeTitle,
        startedAt: Date.now(),
        seats: emptySeats(),
      };
      controller = new AbortController();
      pending = {};
      const { live: _stale, ...selection } = get().seatSelection;
      set({ live, chatError: null, draft: '', seatSelection: selection });

      try {
        await streamCouncil(
          { prompt, threadId: originThreadId ?? undefined, useContext: get().contextEnabled },
          { signal: controller.signal, onEvent: (event) => handleEvent(liveId, event) },
        );
        if (get().live?.id === liveId) {
          set({ live: null, chatError: { message: 'The connection closed before the council finished.', prompt } });
        }
      } catch (err) {
        if (get().live?.id !== liveId) return;
        if ((err as Error)?.name === 'AbortError' || controller?.signal.aborted) {
          set({ live: null, draft: prompt });
          return;
        }
        set({ live: null, chatError: { message: errorMessage(err, 'The council could not answer.'), prompt } });
      } finally {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
        pending = {};
      }
    },

    cancel: () => {
      controller?.abort();
      controller = null;
    },

    dismissError: () => set({ chatError: null }),

    vote: async (turnId, seatId) => {
      const turn = get().turns.find((t) => t.turnId === turnId);
      if (!turn) return;
      const next = turn.preferredAgentId === seatId ? null : seatId;
      const replace = (preferredAgentId: string | null) =>
        set({ turns: get().turns.map((t) => (t.turnId === turnId ? { ...t, preferredAgentId } : t)) });
      replace(next);
      try {
        await api.vote(turnId, next);
      } catch (err) {
        replace(turn.preferredAgentId);
        get().showToast(errorMessage(err, 'Could not save your vote.'), 'danger');
      }
    },

    synthesize: async (turnId) => {
      if (get().synthesizing[turnId]) return;
      set({ synthesizing: { ...get().synthesizing, [turnId]: true } });
      try {
        const { turn } = await api.synthesize(turnId);
        set({ turns: get().turns.map((t) => (t.turnId === turnId ? turn : t)) });
      } catch (err) {
        get().showToast(errorMessage(err, 'The council chair could not build a consensus.'), 'danger');
      } finally {
        const { [turnId]: _, ...rest } = get().synthesizing;
        set({ synthesizing: rest });
      }
    },
  };
};
