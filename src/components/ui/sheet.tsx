import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type DimensionValue,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { elevation, radius, springs, useTheme } from '@/theme';
import { ToastHost } from './feedback';
import { Txt } from './text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /** Optional trailing slot on the title row (e.g. a mono counter). */
  titleRight?: ReactNode;
  /** Expand to a tall scrollable sheet (~88% of screen height). */
  fullHeight?: boolean;
  /** Optional max height override for the sheet panel. */
  maxHeight?: DimensionValue;
  /** Limit drag-to-dismiss to the top handle/header so inner lists scroll freely. */
  dragHandleOnly?: boolean;
  children: ReactNode;
}

/** Bottom sheet (the design's model sheet): spring entrance, drag down to dismiss. */
export function Sheet({
  visible,
  onClose,
  title,
  description,
  titleRight,
  fullHeight = false,
  maxHeight,
  dragHandleOnly = fullHeight,
  children,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const offscreen = Math.max(640, windowHeight);

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
    transform: [{ translateY: interpolate(progress.get(), [0, 1], [offscreen, 0]) + drag.get() }],
  }));

  if (!mounted) return null;

  const resolvedMaxHeight = maxHeight ?? (fullHeight ? '88%' : undefined);
  const gripHeader = (
    <View collapsable={false}>
      <View style={[styles.handle, { backgroundColor: colors.input }]} />
      {title ? (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Txt variant="title" style={styles.title} numberOfLines={2}>
              {title}
            </Txt>
            {titleRight}
          </View>
          {description ? (
            <Txt variant={fullHeight ? 'caption' : 'callout'} tone="secondary">
              {description}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const panelContent = (
    <Animated.View
      style={[
        styles.panel,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          paddingBottom: insets.bottom + 16,
        },
        fullHeight && styles.fullHeightPanel,
        resolvedMaxHeight !== undefined && { maxHeight: resolvedMaxHeight },
        elevation(colors, 2),
        panelStyle,
      ]}
      accessibilityViewIsModal
    >
      {dragHandleOnly ? <GestureDetector gesture={pan}>{gripHeader}</GestureDetector> : gripHeader}
      {children}
    </Animated.View>
  );

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.avoid}
          pointerEvents="box-none"
        >
          {dragHandleOnly ? panelContent : <GestureDetector gesture={pan}>{panelContent}</GestureDetector>}
        </KeyboardAvoidingView>
        <ToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    width: '100%',
  },
  fullHeightPanel: {
    height: '88%',
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { gap: 4, marginBottom: 12, paddingHorizontal: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 17, lineHeight: 23, letterSpacing: -0.3, flexShrink: 1 },
});
