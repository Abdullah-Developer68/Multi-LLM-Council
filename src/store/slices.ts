import { api, ApiError, setAuthToken } from '@/lib/api';
import { DEFAULT_MODEL_IDS, MODEL_SELECTION_LIMITS, type ModelCatalog } from '@/shared/types';
import type { CatalogSlice, ChatSlice, PrefsSlice, SessionSlice, SliceCreator, ThreadsSlice, UISlice } from './types';

export { createChatSlice } from './chat';

const CATALOG_STALE_MS = 5 * 60 * 1000;
let catalogFetchedAt = 0;
let catalogPromise: Promise<void> | null = null;

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError || err instanceof Error ? err.message || fallback : fallback;
}

function reconcileSelection(selected: string[], catalog: ModelCatalog): string[] {
  const freeIds = new Set(catalog.models.filter((m) => m.access === 'free').map((m) => m.id));
  const kept = Array.from(new Set(selected))
    .filter((id) => freeIds.has(id))
    .slice(0, MODEL_SELECTION_LIMITS.max);
  if (kept.length >= MODEL_SELECTION_LIMITS.min) return kept;

  const defaults = Array.from(new Set(catalog.defaults))
    .filter((id) => freeIds.has(id))
    .slice(0, MODEL_SELECTION_LIMITS.max);
  if (defaults.length >= MODEL_SELECTION_LIMITS.min) return defaults;

  const firstFree = catalog.models
    .filter((m) => m.access === 'free')
    .slice(0, MODEL_SELECTION_LIMITS.min)
    .map((m) => m.id);
  return firstFree.length ? firstFree : [...DEFAULT_MODEL_IDS];
}

const SIGNED_OUT = {
  token: null,
  user: null,
  catalog: null,
  catalogStatus: 'idle',
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
} satisfies Partial<SessionSlice & CatalogSlice & ThreadsSlice & ChatSlice & UISlice>;

export const createSessionSlice: SliceCreator<SessionSlice> = (set, get) => ({
  token: null,
  user: null,
  hydrated: false,

  signIn: async (email, password) => {
    const { token, user } = await api.signIn(email, password);
    setAuthToken(token);
    set({ token, user });
    void get().loadThreads();
    void get().loadCatalog();
  },

  signUp: async (email, password, fullName) => {
    const { token, user } = await api.signUp(email, password, fullName);
    setAuthToken(token);
    set({ token, user });
    void get().loadThreads();
    void get().loadCatalog();
  },

  signOut: async ({ everywhere = false, remote = true } = {}) => {
    get().cancel();
    if (remote) await api.signOut(everywhere).catch(() => {});
    catalogFetchedAt = 0;
    catalogPromise = null;
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
  themePreference: 'dark',
  hapticsEnabled: true,
  contextEnabled: true,
  setThemePreference: (themePreference) => set({ themePreference }),
  setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
  setContextEnabled: (contextEnabled) => set({ contextEnabled }),
});

export const createCatalogSlice: SliceCreator<CatalogSlice> = (set, get) => ({
  selectedModels: [...DEFAULT_MODEL_IDS],
  catalog: null,
  catalogStatus: 'idle',

  setSelectedModels: (ids) => {
    const catalog = get().catalog;
    const freeIds = catalog ? new Set(catalog.models.filter((m) => m.access === 'free').map((m) => m.id)) : null;
    const next = Array.from(new Set(ids))
      .filter((id) => (freeIds ? freeIds.has(id) : true))
      .slice(0, MODEL_SELECTION_LIMITS.max);
    if (next.length < MODEL_SELECTION_LIMITS.min) return;
    set({ selectedModels: next });
  },

  toggleModel: (id) => {
    const catalog = get().catalog;
    if (catalog) {
      const entry = catalog.models.find((m) => m.id === id);
      if (!entry || entry.access !== 'free') return;
    }
    const current = get().selectedModels;
    if (current.includes(id)) {
      if (current.length <= MODEL_SELECTION_LIMITS.min) return;
      set({ selectedModels: current.filter((m) => m !== id) });
      return;
    }
    if (current.length >= MODEL_SELECTION_LIMITS.max) {
      get().showToast(`Pick up to ${MODEL_SELECTION_LIMITS.max} models`);
      return;
    }
    set({ selectedModels: [...current, id] });
  },

  loadCatalog: async (opts) => {
    if (!get().token) return;
    const force = opts?.force ?? false;
    if (catalogPromise && !force) return catalogPromise;
    const fresh =
      !force &&
      get().catalog !== null &&
      get().catalogStatus === 'ready' &&
      Date.now() - catalogFetchedAt < CATALOG_STALE_MS;
    if (fresh) return;

    set({ catalogStatus: get().catalog ? 'ready' : 'loading' });
    const run = (async () => {
      try {
        const catalog = await api.catalog();
        if (!get().token) return;
        catalogFetchedAt = Date.now();
        const selectedModels = reconcileSelection(get().selectedModels, catalog);
        set({ catalog, catalogStatus: 'ready', selectedModels });
      } catch {
        if (!get().token) return;
        set({ catalogStatus: get().catalog ? 'ready' : 'error' });
      }
    })().finally(() => {
      if (catalogPromise === run) catalogPromise = null;
    });
    catalogPromise = run;
    return run;
  },
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
  toasts: [],
  showToast: (text, tone = 'neutral') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-2), { id, message: text, tone }] });
    setTimeout(() => get().dismissToast(id), 2800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
});
