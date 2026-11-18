import { api, ApiError, streamCouncil, uploadAttachment } from '@/lib/api';
import { REFINER } from '@/shared/council';
import { ATTACHMENT_LIMITS, DEFAULT_MODEL_IDS, type CouncilEvent, type CouncilTurn, type ModelCatalog } from '@/shared/types';
import type {
  AppStore,
  ChatSlice,
  DraftAttachment,
  LiveAttachment,
  LiveSeat,
  LiveTurn,
  SliceCreator,
} from './types';

/**
 * Streaming state lives outside React: tokens are buffered here and flushed
 * into the store at most every FLUSH_MS, so concurrent token streams
 * don't trigger hundreds of renders per second.
 */
const FLUSH_MS = 60;
let controller: AbortController | null = null;
let pending: Record<string, string> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const uploadControllers = new Map<string, AbortController>();
let attachmentSeq = 0;

function emptySeats(modelIds: string[], catalog: ModelCatalog | null): Record<string, LiveSeat> {
  const byId = new Map(catalog?.models.map((m) => [m.id, m]));
  return Object.fromEntries(
    modelIds.map((id) => {
      const entry = byId.get(id);
      return [
        id,
        {
          seatId: id,
          name: entry?.name ?? id,
          company: entry?.company,
          status: 'waiting',
          model: id,
          text: '',
          rotations: 0,
        },
      ];
    }),
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
      case 'refine:start':
        set({ live: { ...live, refinement: { ...live.refinement, model: event.model } } });
        break;
      case 'refine:done':
        set({
          live: {
            ...live,
            refinement: {
              status: 'done',
              model: event.refinement.model,
              prompt: event.refinement.prompt,
              refined: event.refinement.refined,
            },
          },
        });
        break;
      case 'seat:start':
        if (live.seats[event.seatId]) {
          patchSeat(liveId, event.seatId, () => ({
            model: event.model,
            name: event.name,
            company: event.company,
          }));
        } else {
          set({
            live: {
              ...live,
              seats: {
                ...live.seats,
                [event.seatId]: {
                  seatId: event.seatId,
                  name: event.name,
                  company: event.company,
                  status: 'waiting',
                  model: event.model,
                  text: '',
                  rotations: 0,
                },
              },
            },
          });
        }
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
        patchSeat(liveId, event.seatId, (s) => ({
          status: event.response.status === 'ok' ? 'done' : 'error',
          text: event.response.answer,
          model: event.response.model,
          name: event.response.agentName || s.name,
          company: event.response.company ?? s.company,
          response: event.response,
        }));
        break;
      case 'done':
        flush(liveId);
        finishTurn(get(), live, event.turn);
        break;
      case 'error': {
        flush(liveId);
        const attachmentIds = live.attachments.map((a) => a.id);
        set({
          live: null,
          chatError: {
            message: event.message,
            prompt: live.prompt,
            models: live.models,
            attachmentIds: attachmentIds.length ? attachmentIds : undefined,
            attachments: live.attachments.length ? live.attachments : undefined,
          },
        });
        break;
      }
    }
  };

  const startUpload = async (item: DraftAttachment) => {
    uploadControllers.get(item.localId)?.abort();
    const ac = new AbortController();
    uploadControllers.set(item.localId, ac);
    try {
      const meta = await uploadAttachment(
        { uri: item.uri, name: item.name, type: item.mimeType, webFile: item.webFile },
        { signal: ac.signal },
      );
      if (ac.signal.aborted) return;
      const current = get().draftAttachments;
      if (!current.some((a) => a.localId === item.localId)) return;
      set({
        draftAttachments: current.map((a) =>
          a.localId === item.localId ? { ...a, status: 'ready', meta, error: undefined } : a,
        ),
      });
    } catch (err) {
      if (ac.signal.aborted || (err as Error)?.name === 'AbortError') return;
      const current = get().draftAttachments;
      if (!current.some((a) => a.localId === item.localId)) return;
      set({
        draftAttachments: current.map((a) =>
          a.localId === item.localId ? { ...a, status: 'error', error: errorMessage(err, 'Upload failed.') } : a,
        ),
      });
    } finally {
      if (uploadControllers.get(item.localId) === ac) {
        uploadControllers.delete(item.localId);
      }
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
    draftAttachments: [],
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
      for (const ac of uploadControllers.values()) ac.abort();
      uploadControllers.clear();
      set({
        activeThreadId: null,
        activeTitle: null,
        turns: [],
        threadStatus: 'idle',
        chatError: null,
        draftAttachments: [],
      });
    },

    setDraft: (draft) => set({ draft }),

    addAttachments: (files) => {
      if (!files.length) return;
      const existing = get().draftAttachments;
      const remaining = ATTACHMENT_LIMITS.maxFiles - existing.length;
      if (remaining <= 0) {
        get().showToast(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`, 'danger');
        return;
      }
      if (files.length > remaining) {
        get().showToast(`You can attach up to ${ATTACHMENT_LIMITS.maxFiles} files per message.`);
      }
      const withinSlots = files.slice(0, remaining);
      const valid: DraftAttachment[] = [];
      for (const file of withinSlots) {
        if (file.size > ATTACHMENT_LIMITS.maxBytes) {
          get().showToast(`“${file.name}” exceeds the 15 MB limit.`, 'danger');
          continue;
        }
        valid.push({
          ...file,
          localId: `att_${Date.now()}_${++attachmentSeq}`,
          status: 'uploading',
        });
      }
      if (!valid.length) return;
      set({ draftAttachments: [...existing, ...valid] });
      for (const item of valid) {
        void startUpload(item);
      }
    },

    removeAttachment: (localId) => {
      uploadControllers.get(localId)?.abort();
      uploadControllers.delete(localId);
      set({ draftAttachments: get().draftAttachments.filter((a) => a.localId !== localId) });
    },

    retryAttachment: (localId) => {
      const target = get().draftAttachments.find((a) => a.localId === localId);
      if (!target || target.status === 'uploading' || target.status === 'ready') return;
      const updated: DraftAttachment = { ...target, status: 'uploading', error: undefined };
      set({
        draftAttachments: get().draftAttachments.map((a) => (a.localId === localId ? updated : a)),
      });
      void startUpload(updated);
    },

    send: async (raw, opts) => {
      if (get().live) return;

      const draftAttachments = get().draftAttachments;
      const prevError = get().chatError;
      const isRetry = !opts?.fromComposer && !!prevError && raw === prevError.prompt;
      let sentAttachments: LiveAttachment[] = [];
      let clearedDraftAttachments = false;

      if (isRetry && prevError.attachments?.length) {
        sentAttachments = prevError.attachments;
      } else if (draftAttachments.length > 0) {
        if (draftAttachments.some((a) => a.status !== 'ready' || !a.meta)) return;
        sentAttachments = draftAttachments.map((a) => ({
          ...a.meta!,
          uri: a.kind === 'image' ? a.uri : undefined,
        }));
        clearedDraftAttachments = true;
      }

      const trimmed = raw.trim();
      if (!trimmed && sentAttachments.length === 0) return;

      const allImages = sentAttachments.length > 0 && sentAttachments.every((a) => a.kind === 'image');
      const prompt =
        trimmed || (allImages ? 'Please review the attached photo(s).' : 'Please review the attached file(s).');
      const attachmentIds = sentAttachments.map((a) => a.id);
      const rawModels = opts?.models?.length
        ? opts.models
        : isRetry && prevError.models?.length
          ? prevError.models
          : get().selectedModels;
      const models = rawModels.length ? rawModels : [...DEFAULT_MODEL_IDS];

      const liveId = `live_${Date.now()}`;
      const originThreadId = get().activeThreadId;
      const live: LiveTurn = {
        id: liveId,
        prompt,
        originThreadId,
        title: get().activeTitle,
        startedAt: Date.now(),
        models,
        attachments: sentAttachments,
        refinement: { status: 'refining', model: REFINER.defaultModel },
        seats: emptySeats(models, get().catalog),
      };
      controller = new AbortController();
      pending = {};
      const { live: _stale, ...selection } = get().seatSelection;
      set({
        live,
        chatError: null,
        draft: '',
        ...(clearedDraftAttachments ? { draftAttachments: [] } : {}),
        seatSelection: selection,
      });

      const errorPayload = (message: string) => ({
        message,
        prompt,
        models,
        attachmentIds: attachmentIds.length ? attachmentIds : undefined,
        attachments: sentAttachments.length ? sentAttachments : undefined,
      });

      try {
        await streamCouncil(
          {
            prompt,
            threadId: originThreadId ?? undefined,
            useContext: get().contextEnabled,
            attachmentIds: attachmentIds.length ? attachmentIds : undefined,
            models,
          },
          { signal: controller.signal, onEvent: (event) => handleEvent(liveId, event) },
        );
        if (get().live?.id === liveId) {
          set({
            live: null,
            chatError: errorPayload('The connection closed before the council finished.'),
          });
        }
      } catch (err) {
        if (get().live?.id !== liveId) return;
        if ((err as Error)?.name === 'AbortError' || controller?.signal.aborted) {
          const restored: DraftAttachment[] = sentAttachments.map((att, idx) => ({
            localId: `att_restored_${Date.now()}_${idx}`,
            name: att.name,
            mimeType: att.mimeType,
            size: att.size,
            kind: att.kind,
            uri: att.uri ?? '',
            status: 'ready',
            meta: {
              id: att.id,
              name: att.name,
              mimeType: att.mimeType,
              size: att.size,
              kind: att.kind,
              chars: att.chars,
              truncated: att.truncated,
            },
          }));
          set({
            live: null,
            draft: trimmed,
            draftAttachments: [...restored, ...get().draftAttachments].slice(0, ATTACHMENT_LIMITS.maxFiles),
          });
          return;
        }
        set({
          live: null,
          chatError: errorPayload(errorMessage(err, 'The council could not answer.')),
        });
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
