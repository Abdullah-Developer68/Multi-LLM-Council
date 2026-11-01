import type { AppSliceCreator, AuthSlice } from '../types';
import { apiClient } from '../../services/api-client';

export const createAuthSlice: AppSliceCreator<AuthSlice> = (set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isAuthLoading: false,
  authError: null,
  verifiedModels: [],

  login: async (email: string, password: string): Promise<boolean> => {
    set({ isAuthLoading: true, authError: null });
    try {
      const { token, user, verifiedModels } = await apiClient.login(email, password);
      set({
        user,
        token,
        isAuthenticated: true,
        isAuthLoading: false,
        authError: null,
        verifiedModels,
      });
      // Load user threads upon login
      get().fetchThreads();
      return true;
    } catch (err: any) {
      set({
        authError: err.message || 'Login failed',
        isAuthLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  signup: async (email: string, password: string, fullName: string): Promise<boolean> => {
    set({ isAuthLoading: true, authError: null });
    try {
      const { token, user, verifiedModels } = await apiClient.signup(email, password, fullName);
      set({
        user,
        token,
        isAuthenticated: true,
        isAuthLoading: false,
        authError: null,
        verifiedModels,
      });
      get().fetchThreads();
      return true;
    } catch (err: any) {
      set({
        authError: err.message || 'Sign up failed',
        isAuthLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  },

  logout: async (): Promise<void> => {
    await apiClient.logout();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      authError: null,
      verifiedModels: [],
      turns: [],
      threads: [],
      activeThreadId: null,
      activeStage: 'idle',
      stageMessage: '',
      pendingPrompt: null,
      isSidebarOpen: false,
    });
  },

  checkSession: async (): Promise<void> => {
    if (!get().token) return;
    try {
      const user = await apiClient.getMe();
      set({ user, isAuthenticated: true });
      if (get().verifiedModels.length === 0) {
        apiClient
          .fetchVerifiedModels()
          .then((verifiedModels) => set({ verifiedModels }))
          .catch(() => {
            // Non-fatal: chat will still work with the DB-persisted models.
          });
      }
    } catch {
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  clearAuthError: () => set({ authError: null }),
});
