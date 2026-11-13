import { api, ApiError, setAuthToken } from '@/lib/api';
import type { ChatSlice, PrefsSlice, SessionSlice, SliceCreator, ThreadsSlice, UISlice } from './types';

export { createChatSlice } from './chat';

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback;
}

const SIGNED_OUT = {
  token: null,
  user: null,
  threads: [],
  threadsStatus: 'idle',
  threadQuery: '',
  activeThreadId: null,
  activeTitle: null,
  turns: [],
  threadStatus: 'idle',
  live: null,
  chatError: null,
  draft: '',
  synthesizing: {},
  seatSelection: {},
  drawerOpen: false,
} satisfies Partial<SessionSlice & ThreadsSlice & ChatSlice & UISlice>;

export const createSessionSlice: SliceCreator<SessionSlice> = (set, get) => ({
  token: null,
  user: null,
  hydrated: false,

  signIn: async (email, password) => {
    const { token, user } = await api.signIn(email, password);
    setAuthToken(token);
    set({ token, user });
    void get().loadThreads();
  },

  signUp: async (email, password, fullName) => {
    const { token, user } = await api.signUp(email, password, fullName);
    setAuthToken(token);
    set({ token, user });
    void get().loadThreads();
  },

  signOut: async ({ everywhere = false, remote = true } = {}) => {
    get().cancel();
    if (remote) await api.signOut(everywhere).catch(() => {});
    setAuthToken(null);
    set(SIGNED_OUT);
  },

  refreshUser: async () => {
    if (!get().token) return;
    try {
      const { user } = await api.me();
      set({ user });
    } catch {
      // 401s are handled globally; offline just keeps the cached user.
    }
  },

  updateName: async (fullName) => {
    const { user } = await api.updateProfile(fullName);
    set({ user });
  },
});

export const createPrefsSlice: SliceCreator<PrefsSlice> = (set) => ({
  themePreference: 'system',
  hapticsEnabled: true,
  contextEnabled: true,
  setThemePreference: (themePreference) => set({ themePreference }),
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  setContextEnabled: (contextEnabled) => set({ contextEnabled }),
});

export const createThreadsSlice: SliceCreator<ThreadsSlice> = (set, get) => ({
  threads: [],
  threadsStatus: 'idle',
  threadQuery: '',

  loadThreads: async (query) => {
    const q = query ?? get().threadQuery;
    set({ threadQuery: q, threadsStatus: get().threads.length ? 'ready' : 'loading' });
    try {
      const { threads } = await api.threads(q || undefined);
      // Ignore stale responses from an older search.
      if (get().threadQuery === q) set({ threads, threadsStatus: 'ready' });
    } catch {
      if (get().threadQuery === q) set({ threadsStatus: 'error' });
    }
  },

  renameThread: async (id, title) => {
    const previous = get().threads;
    set({
      threads: previous.map((t) => (t.id === id ? { ...t, title } : t)),
      activeTitle: get().activeThreadId === id ? title : get().activeTitle,
    });
    try {
      await api.updateThread(id, { title });
    } catch (err) {
      set({ threads: previous });
      get().showToast(message(err, 'Could not rename the conversation.'), 'danger');
    }
  },

  togglePin: async (id) => {
    const previous = get().threads;
    const target = previous.find((t) => t.id === id);
    if (!target) return;
    const pinned = !target.pinned;
    const next = previous.map((t) => (t.id === id ? { ...t, pinned } : t));
    next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
    set({ threads: next });
    try {
      await api.updateThread(id, { pinned });
      get().showToast(pinned ? 'Pinned to the top' : 'Unpinned');
    } catch (err) {
      set({ threads: previous });
      get().showToast(message(err, 'Could not update the conversation.'), 'danger');
    }
  },

  deleteThread: async (id) => {
    const previous = get().threads;
    set({ threads: previous.filter((t) => t.id !== id) });
    if (get().activeThreadId === id) get().newChat();
    try {
      await api.deleteThread(id);
      get().showToast('Conversation deleted');
    } catch (err) {
      set({ threads: previous });
      get().showToast(message(err, 'Could not delete the conversation.'), 'danger');
    }
  },
});

let toastId = 0;

export const createUISlice: SliceCreator<UISlice> = (set, get) => ({
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toasts: [],
  showToast: (text, tone = 'neutral') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-2), { id, message: text, tone }] });
    setTimeout(() => get().dismissToast(id), 2800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
