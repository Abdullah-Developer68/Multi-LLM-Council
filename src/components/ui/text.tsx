import { Text, type TextProps } from 'react-native';

import { type, useTheme, type Palette, type TypeVariant } from '@/theme';

/**
 * Text tones map onto palette roles:
 * primary → foreground, secondary → mutedForeground, tertiary → faint,
 * accent → link, inverse → primaryForeground.
 */
export type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'success' | 'warning' | 'inverse';

function toneColor(colors: Palette, tone: Tone): string {
  switch (tone) {
    case 'secondary':
      return colors.mutedForeground;
    case 'tertiary':
      return colors.faint;
    case 'accent':
      return colors.link;
    case 'danger':
      return colors.destructive;
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'inverse':
      return colors.primaryForeground;
    default:
      return colors.foreground;
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

/** Small medium-weight label: group titles, field labels, metadata. */
export function Label({ children, tone = 'secondary', ...rest }: TxtProps) {
  return (
    <Txt variant="label" tone={tone} {...rest}>
      {children}
    </Txt>
  );
}

/** Two-tone headline: a faint lead line over a strong line. */
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
    <Text style={[type[variant], { color: colors.foreground, textAlign: align }]} accessibilityRole="header">
      <Text style={{ color: colors.faint }}>{muted}</Text>
      {'\n'}
      {strong}
    </Text>
  );
}
