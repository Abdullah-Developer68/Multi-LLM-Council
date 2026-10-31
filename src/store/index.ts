import { create } from 'zustand';
import type { AppStore } from './types';
import { createAuthSlice } from './slices/auth-slice';
import { createChatSlice } from './slices/chat-slice';
import { createUISlice } from './slices/ui-slice';

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createChatSlice(...a),
  ...createUISlice(...a),
}));

export * from './types';
