import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { control, fonts, radius, useTheme } from '@/theme';
import { Txt } from './text';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: LucideIcon;
  /** Element at the trailing edge, inside the field (a badge, a button). */
  trailing?: ReactNode;
  secure?: boolean;
  size?: 'md' | 'lg';
  ref?: Ref<TextInputInstance>;
}

/** shadcn input: input-coloured border, radius md, a soft ring on focus. */
export function TextField({
  label,
  hint,
  error,
  icon: Icon,
  trailing,
  secure = false,
  size = 'md',
  editable = true,
  onFocus,
  onBlur,
  style,
  ref,
  ...rest
}: TextFieldProps) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(secure);
  const [focused, setFocused] = useState(false);
  const ringColor = error ? colors.destructive : colors.ring;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Txt variant="calloutMedium" style={styles.label}>
          {label}
        </Txt>
      ) : null}
      <View
        style={[
          styles.frame,
          {
            height: size === 'lg' ? control.lg : control.md,
            backgroundColor: editable ? colors.card : colors.muted,
            borderColor: focused || error ? ringColor : colors.input,
          },
          focused && { boxShadow: `0px 0px 0px 3px ${error ? colors.destructiveSoft : colors.muted}` },
        ]}
      >
        {Icon ? <Icon size={16} color={colors.mutedForeground} strokeWidth={1.75} /> : null}
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          secureTextEntry={hidden}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.foreground}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            { color: editable ? colors.foreground : colors.mutedForeground },
            Platform.OS === 'web' && styles.webInput,
            style,
          ]}
        />
        {trailing}
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? (
              <Eye size={16} color={colors.mutedForeground} strokeWidth={1.75} />
            ) : (
              <EyeOff size={16} color={colors.mutedForeground} strokeWidth={1.75} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)}>
          <Txt variant="caption" tone="danger">
            {error}
          </Txt>
        </Animated.View>
      ) : hint ? (
        <Txt variant="caption" tone="secondary">
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 13 },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 14, paddingVertical: 0, height: '100%' },
  webInput: { outlineStyle: 'none' } as object,
});
