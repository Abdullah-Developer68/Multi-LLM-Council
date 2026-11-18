import type { StateCreator } from 'zustand';

import type { ThemePreference } from '@/theme/tokens';
import type { CouncilTurn, SeatResponse, ThreadSummary, UserAccount } from '@/shared/types';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SessionSlice {
  token: string | null;
  user: UserAccount | null;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: (opts?: { everywhere?: boolean; remote?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  updateName: (fullName: string) => Promise<void>;
}

export interface PrefsSlice {
  themePreference: ThemePreference;
  hapticsEnabled: boolean;
  contextEnabled: boolean;
  setThemePreference: (value: ThemePreference) => void;
  setHapticsEnabled: (value: boolean) => void;
  setContextEnabled: (value: boolean) => void;
}

export interface ThreadsSlice {
  threads: ThreadSummary[];
  threadsStatus: LoadStatus;
  threadQuery: string;
  loadThreads: (query?: string) => Promise<void>;
  renameThread: (id: string, title: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  deleteThread: (id: string) => Promise<void>;
}

export type LiveSeatStatus = 'waiting' | 'thinking' | 'streaming' | 'done' | 'error';

export interface LiveSeat {
  seatId: string;
  status: LiveSeatStatus;
  model: string;
  text: string;
  rotations: number;
  response?: SeatResponse;
}

export interface LiveTurn {
  id: string;
  prompt: string;
  /** Thread the turn was sent from (null for a new conversation). */
  originThreadId: string | null;
  title: string | null;
  startedAt: number;
  refinement: {
    status: 'refining' | 'done';
    model: string;
    prompt?: string;
    refined?: boolean;
  };
  seats: Record<string, LiveSeat>;
}

export interface ChatSlice {
  activeThreadId: string | null;
  activeTitle: string | null;
  turns: CouncilTurn[];
  threadStatus: LoadStatus;
  live: LiveTurn | null;
  chatError: { message: string; prompt: string } | null;
  draft: string;
  synthesizing: Record<string, boolean>;
  /** Which seat's answer is shown per turn (`live` while streaming); `picked` = chosen by the user. */
  seatSelection: Record<string, { index: number; picked: boolean }>;
  selectSeat: (key: string, index: number) => void;
  openThread: (id: string) => Promise<void>;
  newChat: () => void;
  setDraft: (text: string) => void;
  send: (prompt: string) => Promise<void>;
  cancel: () => void;
  dismissError: () => void;
  vote: (turnId: string, seatId: string) => Promise<void>;
  synthesize: (turnId: string) => Promise<void>;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'neutral' | 'success' | 'danger';
}

export interface UISlice {
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  toasts: Toast[];
  showToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

export type AppStore = SessionSlice & PrefsSlice & ThreadsSlice & ChatSlice & UISlice;
export type SliceCreator<T> = StateCreator<AppStore, [['zustand/persist', unknown]], [], T>;
