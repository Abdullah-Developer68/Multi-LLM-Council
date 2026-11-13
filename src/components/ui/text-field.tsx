import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useState, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import Animated, { FadeIn, FadeOut, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fonts, radius, useTheme } from '@/theme';
import { Txt } from './text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string | null;
  icon?: LucideIcon;
  secure?: boolean;
  ref?: Ref<TextInputInstance>;
}

/** Labelled input whose border animates to the focus colour. */
export function TextField({ label, error, icon: Icon, secure = false, onFocus, onBlur, style, ref, ...rest }: TextFieldProps) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(secure);
  const focus = useSharedValue(0);

  const frameStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.danger
      : interpolateColor(focus.get(), [0, 1], [colors.borderStrong, colors.accent]),
  }));

  return (
    <View style={styles.wrap}>
      {label ? (
        <Txt variant="caption" tone="secondary" style={styles.label}>
          {label}
        </Txt>
      ) : null}
      <Animated.View style={[styles.frame, { backgroundColor: colors.surface }, frameStyle]}>
        {Icon ? <Icon size={16} color={colors.textTertiary} strokeWidth={1.7} /> : null}
        <TextInput
          ref={ref}
          {...rest}
          secureTextEntry={hidden}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          onFocus={(e) => {
            focus.set(withTiming(1, { duration: 160 }));
            onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.set(withTiming(0, { duration: 160 }));
            onBlur?.(e);
          }}
          style={[styles.input, { color: colors.text }, Platform.OS === 'web' && styles.webInput, style]}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? (
              <Eye size={17} color={colors.textTertiary} strokeWidth={1.7} />
            ) : (
              <EyeOff size={17} color={colors.textTertiary} strokeWidth={1.7} />
            )}
          </Pressable>
        ) : null}
      </Animated.View>
      {error ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <Txt variant="caption" tone="danger" style={styles.error}>
            {error}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { marginLeft: 14 },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 12 },
  webInput: { outlineStyle: 'none' } as object,
  error: { marginLeft: 14 },
});
