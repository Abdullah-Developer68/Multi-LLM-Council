import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { useAppStore } from '@/store';

function enabled(): boolean {
  return Platform.OS !== 'web' && useAppStore.getState().hapticsEnabled;
}

export const haptic = {
  tap() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  select() {
    if (enabled()) Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warn() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
};
