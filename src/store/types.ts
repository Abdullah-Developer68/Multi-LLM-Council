import type { StateCreator } from 'zustand';
import type {
  MultiAgentTurn,
  PipelineStage,
  ThreadSummary,
  UserAccount,
  VerifiedModelConfig,
} from '../types';

export interface AuthSlice {
  user: UserAccount | null;
  token: string | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authError: string | null;
  /** Free OpenRouter models verified & persisted on the last login. */
  verifiedModels: VerifiedModelConfig[];
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string, fullName: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  clearAuthError: () => void;
}

export interface ChatSlice {
  turns: MultiAgentTurn[];
  threads: ThreadSummary[];
  activeThreadId: string | null;
  activeStage: PipelineStage;
  stageMessage: string;
  chatError: string | null;
  pendingPrompt: string | null;
  activeViews: Record<string, string>; // turnId -> active view ('all_models' | agentId)
  fetchThreads: () => Promise<void>;
  selectThread: (threadId: string | null) => Promise<void>;
  setActiveView: (turnId: string, view: string) => void;
  submitPrompt: (prompt: string) => Promise<void>;
  resetChat: () => void;
  clearChatError: () => void;
}

export interface UISlice {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export type AppStore = AuthSlice & ChatSlice & UISlice;

export type AppSliceCreator<T> = StateCreator<AppStore, [], [], T>;
