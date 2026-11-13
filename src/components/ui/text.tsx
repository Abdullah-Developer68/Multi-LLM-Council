import { Text, type TextProps } from 'react-native';

import { type, useTheme, type Palette, type TypeVariant } from '@/theme';

export type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse';

function toneColor(colors: Palette, tone: Tone): string {
  switch (tone) {
    case 'secondary':
      return colors.textSecondary;
    case 'tertiary':
      return colors.textTertiary;
    case 'accent':
      return colors.accent;
    case 'danger':
      return colors.danger;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'inverse':
      return colors.onPrimary;
    default:
      return colors.text;
  }
}

export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  tone?: Tone;
  color?: string;
}

export function Txt({ variant = 'body', tone = 'primary', color, style, ...rest }: TxtProps) {
  const { colors } = useTheme();
  return <Text {...rest} style={[type[variant], { color: color ?? toneColor(colors, tone) }, style]} />;
}

/** Mono micro-label, e.g. `[ 01 ]` or `COUNCIL`. */
export function MonoLabel({ children, tone = 'tertiary', style, ...rest }: TxtProps) {
  return (
    <Txt variant="label" tone={tone} style={[{ textTransform: 'uppercase' }, style]} {...rest}>
      {children}
    </Txt>
  );
}

/** Two-tone editorial headline: a muted lead line over a strong line. */
export function Headline({
  muted,
  strong,
  variant = 'display',
  align = 'left',
}: {
  muted: string;
  strong: string;
  variant?: 'display' | 'title' | 'headline';
  align?: 'left' | 'center';
}) {
  const { colors } = useTheme();
  return (
    <Text style={[type[variant], { color: colors.text, textAlign: align }]} accessibilityRole="header">
      <Text style={{ color: colors.textTertiary }}>{muted}</Text>
      {'\n'}
      {strong}
    </Text>
  );
}
