import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { radius, springs, useTheme } from '@/theme';
import { Txt } from './text';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const segment = width ? (width - 6) / options.length : 0;
  const x = useDerivedValue(() => withSpring(index * segment, springs.snappy), [index, segment]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.segmented, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
      accessibilityRole="tablist"
    >
      {segment > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            { width: segment, backgroundColor: colors.surface, borderColor: colors.border },
            thumbStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            style={styles.segment}
            onPress={() => {
              if (!active) haptic.select();
              onChange(option.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            {Icon ? <Icon size={15} color={active ? colors.text : colors.textSecondary} strokeWidth={1.7} /> : null}
            <Txt variant="calloutMedium" tone={active ? 'primary' : 'secondary'}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Animated on/off switch. */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  const progress = useDerivedValue(() => withSpring(value ? 1 : 0, springs.snappy), [value]);
  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.surfaceSunken, colors.primary]),
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.get() * 18 }],
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
      <Animated.View style={[styles.track, { borderColor: colors.border }, trackStyle]}>
        <Animated.View style={[styles.knob, { backgroundColor: value ? colors.onPrimary : colors.surface }, knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 3,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    height: 34,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3, borderWidth: 1 },
  knob: { width: 18, height: 18, borderRadius: 9 },
});
