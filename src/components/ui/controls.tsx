import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { control, radius, springs, useTheme } from '@/theme';
import { Txt } from './text';

export interface SegmentOption<T extends string> {
  value: T;
  label?: string;
  icon?: LucideIcon;
  accessibilityLabel?: string;
}

/**
 * Two looks from the design:
 * - `group` (toggle group): bordered strip split by hairlines, active segment on `muted`.
 * - `tabs`: a `muted` track whose active segment is a raised `background` pill.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'group',
}: {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  variant?: 'group' | 'tabs';
}) {
  const { colors } = useTheme();
  const tabs = variant === 'tabs';
  return (
    <View
      style={[
        tabs ? styles.tabs : styles.group,
        tabs ? { backgroundColor: colors.muted } : { borderColor: colors.input, backgroundColor: colors.card },
      ]}
      accessibilityRole="tablist"
    >
      {options.map((option, i) => {
        const active = option.value === value;
        const Icon = option.icon;
        const fg = active ? colors.foreground : colors.mutedForeground;
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!active) haptic.select();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            style={({ pressed }) => [
              tabs ? styles.tab : styles.item,
              !tabs && i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.input },
              active && (tabs ? [styles.tabActive, { backgroundColor: colors.background, borderColor: colors.input }] : { backgroundColor: colors.muted }),
              pressed && !active && styles.pressed,
            ]}
          >
            {Icon ? <Icon size={16} color={fg} strokeWidth={1.75} /> : null}
            {option.label ? (
              <Txt variant="calloutMedium" color={fg}>
                {option.label}
              </Txt>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** shadcn switch: primary track when on, input track when off. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors, scheme } = useTheme();
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, springs.snappy), [value]);
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.input, colors.primary]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * 18 }],
    backgroundColor:
      scheme === 'dark'
        ? interpolateColor(progress.get(), [0, 1], [colors.foreground, colors.primaryForeground])
        : colors.card,
  }));
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onChange(!value);
      }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  item: {
    flex: 1,
    minWidth: 0,
    height: control.lg - 2,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: radius.md + 2 },
  tab: {
    flex: 1,
    minWidth: 0,
    height: control.md,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabActive: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.3)' },
  pressed: { opacity: 0.7 },
  track: { width: 42, height: 24, borderRadius: 12, padding: 3 },
  knob: { width: 18, height: 18, borderRadius: 9 },
});
