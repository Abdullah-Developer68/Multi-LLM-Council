import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, radius, useTheme } from '@/theme';
import { PressableScale } from './pressable-scale';
import { Txt } from './text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const HEIGHT: Record<Size, number> = { sm: 32, md: 40, lg: 48 };
const PAD: Record<Size, number> = { sm: 12, md: 16, lg: 22 };
const FONT: Record<Size, number> = { sm: 13, md: 14, lg: 15 };

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** Pill button. `primary` is the near-black action, `secondary` the outlined pill. */
export function Button({
  label,
  onPress,
  variant = 'primary',
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
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: 'transparent' },
  }[variant];
  const iconSize = size === 'lg' ? 18 : 16;

  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      haptics
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={[
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: PAD[size],
          backgroundColor: palette.bg,
          borderColor: palette.border,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {Icon ? <Icon size={iconSize} color={palette.fg} strokeWidth={1.8} /> : null}
          <Txt style={{ fontFamily: fonts.medium, fontSize: FONT[size], lineHeight: FONT[size] + 4 }} color={palette.fg}>
            {label}
          </Txt>
          {IconRight ? <IconRight size={iconSize} color={palette.fg} strokeWidth={1.8} /> : null}
        </View>
      )}
    </PressableScale>
  );
}

/** Blue inline link with a trailing chevron — "Explore council ›". */
export function LinkButton({ label, onPress, tone = 'accent' }: { label: string; onPress?: () => void; tone?: 'accent' | 'secondary' }) {
  const { colors } = useTheme();
  const color = tone === 'accent' ? colors.accent : colors.textSecondary;
  return (
    <PressableScale onPress={onPress} accessibilityRole="link" style={styles.link} hitSlop={8}>
      <Txt variant="calloutMedium" color={color}>
        {label}
      </Txt>
      <ChevronRight size={15} color={color} strokeWidth={2} />
    </PressableScale>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  label,
  size = 38,
  bordered = false,
  active = false,
  disabled = false,
  color,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
  bordered?: boolean;
  active?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.9}
      haptics
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? colors.surfaceMuted : bordered ? colors.surface : 'transparent',
        borderWidth: bordered ? StyleSheet.hairlineWidth * 2 : 0,
        borderColor: colors.border,
      }}
    >
      <Icon size={Math.round(size * 0.47)} color={color ?? colors.text} strokeWidth={1.7} />
    </PressableScale>
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
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
});
