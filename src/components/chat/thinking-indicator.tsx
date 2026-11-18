import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { Txt } from '../ui/text';

/** Pulsing dot + label used while a model is working ("Refining your prompt…"). */
export function ThinkingIndicator({ label }: { label: string }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(withRepeat(withSequence(withTiming(0.55, { duration: 650 }), withTiming(1, { duration: 650 })), -1));
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const text = useAnimatedStyle(() => ({ opacity: 0.45 + (pulse.get() - 0.55) * 1.1 }));
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.thinking} accessibilityLabel={label}>
      <Animated.View style={[styles.dot, { backgroundColor: colors.foreground }, dot]} />
      <Animated.View style={text}>
        <Txt variant="callout" tone="secondary">
          {label}
        </Txt>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
