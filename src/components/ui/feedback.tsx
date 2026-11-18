import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
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
import { elevation, radius, useTheme } from '@/theme';
import { Txt } from './text';

/** Pulsing placeholder block (shadcn Skeleton: muted fill, radius md). */
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
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [pulse]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: Math.min(radius.md, height / 2), backgroundColor: colors.muted }, animatedStyle, style]}
    />
  );
}

/** Thin progress track with a foreground fill (the "credits" bar in the design). */
export function Progress({ value, color }: { value: number; color?: string }) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={[styles.track, { backgroundColor: colors.muted }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: color ?? colors.foreground }]} />
    </View>
  );
}

/** Segmented progress bar: filled segments are done, the next one pulses. */
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
    <View style={[styles.segment, { backgroundColor: colors.muted }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.foreground, borderRadius: 2 }, fill]} />
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

/** Inline alert: a tinted box with an icon, used for errors and notices. */
export function Alert({
  tone = 'danger',
  title,
  children,
  style,
}: {
  tone?: 'danger' | 'info';
  title?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const danger = tone === 'danger';
  const fg = danger ? colors.destructive : colors.foreground;
  const Icon = danger ? CircleAlert : Info;
  return (
    <View
      style={[
        styles.alert,
        { backgroundColor: danger ? colors.destructiveSoft : colors.card, borderColor: danger ? 'transparent' : colors.border },
        style,
      ]}
      accessibilityRole="alert"
    >
      <Icon size={16} color={fg} strokeWidth={1.75} style={styles.alertIcon} />
      <View style={styles.alertBody}>
        {title ? (
          <Txt variant="calloutMedium" color={fg}>
            {title}
          </Txt>
        ) : null}
        {typeof children === 'string' ? (
          <Txt variant="callout" color={danger ? colors.destructive : colors.mutedForeground}>
            {children}
          </Txt>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/** Sonner-style toasts: a popover card with an icon, stacked at the top. */
export function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + 12 }]}>
      {toasts.map((toast) => {
        const Icon = toast.tone === 'danger' ? CircleAlert : CircleCheck;
        const tint = toast.tone === 'danger' ? colors.destructive : toast.tone === 'success' ? colors.success : colors.foreground;
        return (
          <Animated.View
            key={toast.id}
            entering={FadeInUp.springify().damping(18)}
            exiting={FadeOutUp.duration(180)}
            layout={LinearTransition.springify().damping(20)}
          >
            <Pressable
              onPress={() => dismiss(toast.id)}
              style={[styles.toast, { backgroundColor: colors.popover, borderColor: colors.border }, elevation(colors, 2)]}
              accessibilityRole="alert"
            >
              <Icon size={16} color={tint} strokeWidth={1.75} />
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
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  segments: { flexDirection: 'row', gap: 4, height: 3 },
  segment: { flex: 1, borderRadius: 2, overflow: 'hidden' },
  alert: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, borderWidth: 1 },
  alertIcon: { marginTop: 2 },
  alertBody: { flex: 1, gap: 2 },
  toastHost: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    minWidth: 260,
    maxWidth: 420,
  },
  toastText: { flexShrink: 1 },
});
