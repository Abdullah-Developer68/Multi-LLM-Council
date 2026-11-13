import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppStore } from '@/store';
import { radius, useTheme } from '@/theme';
import { Txt } from './text';

/** Pulsing placeholder block. */
export function Skeleton({
  width = '100%',
  height = 14,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0.55);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: height / 2, backgroundColor: colors.skeleton }, animatedStyle, style]}
    />
  );
}

/**
 * Segmented progress bar (the blue "2/5" bar): filled segments are done,
 * the next one shimmers while in progress.
 */
export function ProgressSegments({ total, done, active = true }: { total: number; done: number; active?: boolean }) {
  return (
    <View style={styles.segments} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} state={i < done ? 'done' : i === done && active ? 'active' : 'idle'} />
      ))}
    </View>
  );
}

function Segment({ state }: { state: 'done' | 'active' | 'idle' }) {
  const { colors } = useTheme();
  const glow = useSharedValue(0);
  useEffect(() => {
    if (state === 'active') {
      glow.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.25, { duration: 700 })), -1));
    } else {
      glow.set(withTiming(state === 'done' ? 1 : 0, { duration: 260 }));
    }
  }, [state, glow]);
  const fill = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return (
    <View style={[styles.segment, { backgroundColor: colors.border }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.accent, borderRadius: 2 }, fill]} />
    </View>
  );
}

/** Small pulsing dot used for "live" states. */
export function PulseDot({ color, size = 7 }: { color: string; size?: number }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(0.3, { duration: 600 }), withTiming(1, { duration: 600 })), -1));
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + 8 }]}>
      {toasts.map((toast) => {
        const Icon = toast.tone === 'danger' ? CircleAlert : CircleCheck;
        const tint = toast.tone === 'danger' ? colors.danger : toast.tone === 'success' ? colors.success : colors.text;
        return (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(180)}
            layout={LinearTransition.springify().damping(20)}
          >
            <Pressable
              onPress={() => dismiss(toast.id)}
              style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }]}
              accessibilityRole="alert"
            >
              <Icon size={16} color={tint} strokeWidth={1.8} />
              <Txt variant="callout" style={styles.toastText} numberOfLines={3}>
                {toast.message}
              </Txt>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: { flexDirection: 'row', gap: 4, height: 3 },
  segment: { flex: 1, borderRadius: 2, overflow: 'hidden' },
  toastHost: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: radius.pill,
    borderWidth: 1,
    maxWidth: 460,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  toastText: { flexShrink: 1 },
});
