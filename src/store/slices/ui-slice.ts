import type { AppSliceCreator, UISlice } from '../types';

export const createUISlice: AppSliceCreator<UISlice> = (set, get) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set({ isSidebarOpen: !get().isSidebarOpen }),
  setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),
});
