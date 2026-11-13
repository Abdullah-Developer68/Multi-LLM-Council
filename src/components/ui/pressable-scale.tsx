import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { springs } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed. */
  scaleTo?: number;
  /** Fire a light haptic on press. */
  haptics?: boolean;
}

/** Pressable that springs down slightly while held — the base of every tappable surface. */
export function PressableScale({
  style,
  scaleTo = 0.97,
  haptics = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, scaleTo]) }],
    opacity: interpolate(pressed.get(), [0, 1], [1, 0.9]),
  }));

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressed.set(withSpring(1, springs.snappy));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.set(withSpring(0, springs.snappy));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptics) haptic.tap();
        onPress?.(e);
      }}
      style={[style, animatedStyle, disabled ? { opacity: 0.45 } : null]}
    />
  );
}
