import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { radius, springs, useTheme } from '@/theme';
import { Txt } from './text';

const OFFSCREEN = 640;

/** Bottom sheet with a spring entrance and drag-down-to-dismiss. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      drag.set(0);
      progress.set(withSpring(1, springs.gentle));
    } else {
      progress.set(
        withTiming(0, { duration: 200 }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, progress, drag]);

  const pan = usePanGesture({
    activeOffsetY: 8,
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY > 110 || e.velocityY > 900) {
        scheduleOnRN(onClose);
      } else {
        drag.set(withSpring(0, springs.snappy));
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.get(), [0, 1], [OFFSCREEN, 0]) + drag.get() }],
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              styles.panel,
              { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: insets.bottom + 16 },
              panelStyle,
            ]}
          >
            <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
            {title ? (
              <Txt variant="bodyMedium" style={styles.title} numberOfLines={2}>
                {title}
              </Txt>
            ) : null}
            {children}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { marginBottom: 12, paddingHorizontal: 4 },
});
