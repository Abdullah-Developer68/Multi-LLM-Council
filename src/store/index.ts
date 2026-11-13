import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { setAuthToken, setUnauthorizedHandler } from '@/lib/api';
import { safeStorage } from '@/lib/storage';
import { createChatSlice, createPrefsSlice, createSessionSlice, createThreadsSlice, createUISlice } from './slices';
import type { AppStore } from './types';

export const useAppStore = create<AppStore>()(
  persist(
    (...a) => ({
      ...createSessionSlice(...a),
      ...createPrefsSlice(...a),
      ...createThreadsSlice(...a),
      ...createChatSlice(...a),
      ...createUISlice(...a),
    }),
    {
      name: 'tra-council',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        themePreference: s.themePreference,
        hapticsEnabled: s.hapticsEnabled,
        contextEnabled: s.contextEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        setAuthToken(state?.token ?? null);
        useAppStore.setState({ hydrated: true });
      },
    },
  ),
);

setUnauthorizedHandler(() => {
  const { token, signOut, showToast } = useAppStore.getState();
  if (!token) return;
  void signOut({ remote: false });
  showToast('Your session expired. Please sign in again.', 'danger');
});

export type * from './types';
