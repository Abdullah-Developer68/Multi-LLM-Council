import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StateStorage } from 'zustand/middleware';

/**
 * AsyncStorage adapter that is a safe no-op during web static rendering
 * (Node has no `window`) and never throws into the store.
 */
const isServer = typeof window === 'undefined';

export const safeStorage: StateStorage = {
  getItem: async (name) => {
    if (isServer) return null;
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    if (isServer) return;
    try {
      await AsyncStorage.setItem(name, value);
    } catch {
      // storage full or unavailable — preferences just won't persist
    }
  },
  removeItem: async (name) => {
    if (isServer) return;
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};
