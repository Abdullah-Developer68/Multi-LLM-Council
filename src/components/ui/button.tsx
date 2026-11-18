import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/lib/haptics';
import { control, fonts, radius, useTheme, type Palette } from '@/theme';
import { Txt } from './text';

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const PAD: Record<Size, number> = { sm: 12, md: 16, lg: 20 };
const FONT: Record<Size, number> = { sm: 13, md: 14, lg: 14 };

function variantColors(colors: Palette, variant: ButtonVariant) {
  switch (variant) {
    case 'outline':
      return { bg: colors.card, fg: colors.foreground, border: colors.input };
    case 'secondary':
      return { bg: colors.muted, fg: colors.foreground, border: 'transparent' };
    case 'ghost':
      return { bg: 'transparent', fg: colors.foreground, border: 'transparent' };
    case 'destructive':
      return { bg: colors.destructiveSoft, fg: colors.destructive, border: 'transparent' };
    default:
      return { bg: colors.primary, fg: colors.primaryForeground, border: colors.primary };
  }
}

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * shadcn button. Pill-shaped like the StudyBot design: `default` is the solid
 * primary, `outline` sits on a card with an input-coloured border, `ghost` only
 * shows a fill while pressed.
 */
export function Button({
  label,
  onPress,
  variant = 'default',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const v = variantColors(colors, variant);
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          height: control[size],
          paddingHorizontal: PAD[size],
          backgroundColor: v.bg,
          borderColor: v.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        variant === 'outline' && styles.outlineShadow,
        pressed && (variant === 'ghost' ? { backgroundColor: colors.muted } : styles.pressed),
        disabled && !loading && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.fg} />
      ) : (
        <View style={[styles.row, size === 'sm' && styles.rowSm]}>
          {Icon ? <Icon size={16} color={v.fg} strokeWidth={1.75} /> : null}
          <Txt style={{ fontFamily: fonts.medium, fontSize: FONT[size], lineHeight: FONT[size] + 4 }} color={v.fg}>
            {label}
          </Txt>
          {IconRight ? <IconRight size={16} color={v.fg} strokeWidth={1.75} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/** Inline link with a trailing chevron. */
export function LinkButton({ label, onPress, tone = 'accent' }: { label: string; onPress?: () => void; tone?: 'accent' | 'secondary' }) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.link : colors.mutedForeground;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.link} hitSlop={8}>
      <Txt variant="calloutMedium" color={color}>
        {label}
      </Txt>
      <ChevronRight size={15} color={color} strokeWidth={2} />
    </Pressable>
  );
}

/**
 * Square icon button (`icon-sm` in the design): 32px, radius md. `round`
 * gives the circular composer variant; `variant` follows Button.
 */
export function IconButton({
  icon: Icon,
  onPress,
  label,
  size = control.sm,
  variant = 'ghost',
  round = false,
  active = false,
  disabled = false,
  color,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
  variant?: ButtonVariant;
  round?: boolean;
  active?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  const v = variantColors(colors, variant);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: round ? radius.pill : radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: variant === 'outline' ? 1 : 0,
          borderColor: v.border,
          backgroundColor: active || (pressed && variant === 'ghost') ? colors.muted : v.bg,
        },
        variant === 'outline' && styles.outlineShadow,
        pressed && variant !== 'ghost' && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon size={Math.min(18, Math.round(size * 0.5))} color={color ?? v.fg} strokeWidth={1.75} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowSm: { gap: 6 },
  outlineShadow: { boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.25)' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
});
