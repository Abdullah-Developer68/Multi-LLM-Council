import type { AppSliceCreator, ChatSlice } from '../types';
import { apiClient } from '../../services/api-client';

export const createChatSlice: AppSliceCreator<ChatSlice> = (set, get) => ({
  turns: [],
  threads: [],
  activeThreadId: null,
  activeStage: 'idle',
  stageMessage: '',
  chatError: null,
  pendingPrompt: null,
  activeViews: {},

  fetchThreads: async () => {
    try {
      const threads = await apiClient.fetchThreads();
      set({ threads });
    } catch {
      // ignore
    }
  },

  selectThread: async (threadId: string | null) => {
    if (!threadId) {
      set({
        activeThreadId: null,
        turns: [],
        activeStage: 'idle',
        stageMessage: '',
        chatError: null,
      });
      return;
    }

    set({
      activeThreadId: threadId,
      turns: [],
      activeStage: 'idle',
      stageMessage: 'Loading discussion history...',
      chatError: null,
    });

    try {
      const turns = await apiClient.fetchThreadMessages(threadId);
      const views: Record<string, string> = {};
      turns.forEach((t) => {
        views[t.turnId] = 'all_models';
      });
      set({ turns, activeViews: views, stageMessage: '' });
    } catch (err: any) {
      set({ chatError: err.message || 'Failed to load thread history', stageMessage: '' });
    }
  },

  setActiveView: (turnId: string, view: string) => {
    const activeViews = { ...get().activeViews, [turnId]: view };
    set({ activeViews });
  },

  submitPrompt: async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const currentThread = get().activeThreadId;
    set({
      activeStage: 'optimizing',
      stageMessage: 'Agents are analyzing & refining the prompt...',
      pendingPrompt: trimmed,
      chatError: null,
    });

    const step1Timer = setTimeout(() => {
      if (get().activeStage === 'optimizing') {
        set({
          activeStage: 'queryingAgents',
          stageMessage: 'Prompt is being passed to different agents in the council ring...',
        });
      }
    }, 1400);

    const step2Timer = setTimeout(() => {
      if (get().activeStage === 'queryingAgents') {
        set({
          activeStage: 'synthesizing',
          stageMessage: 'Cross-examining solutions & synthesizing council consensus...',
        });
      }
    }, 3200);

    try {
      const turn = await apiClient.sendPrompt(trimmed, currentThread || undefined);
      clearTimeout(step1Timer);
      clearTimeout(step2Timer);
      const updatedTurns = [...get().turns, turn];
      const updatedViews = { ...get().activeViews, [turn.turnId]: 'all_models' };

      set({
        turns: updatedTurns,
        activeViews: updatedViews,
        activeStage: 'complete',
        stageMessage: '',
        activeThreadId: turn.threadId,
        pendingPrompt: null,
      });

      // Refresh threads list
      get().fetchThreads();
    } catch (err: any) {
      set({
        activeStage: 'error',
        stageMessage: '',
        chatError: err.message || 'Failed to execute deliberation turn.',
        pendingPrompt: null,
      });
    }
  },

  resetChat: () => {
    set({
      activeThreadId: null,
      turns: [],
      activeStage: 'idle',
      stageMessage: '',
      chatError: null,
      pendingPrompt: null,
    });
  },

  clearChatError: () => set({ chatError: null }),
});
