import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Txt } from './text';

/** shadcn card: card surface, hairline border, radius lg. */
export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg },
        padded && { padding: 20 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Card title + description, with an optional trailing element (a badge, a button). */
export function CardHeader({ title, description, trailing }: { title: string; description?: string; trailing?: ReactNode }) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.flex}>
        <Txt variant="headline">{title}</Txt>
        {description ? (
          <Txt variant="callout" tone="secondary" style={styles.cardDescription}>
            {description}
          </Txt>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}

/** Group label above a block of content ("Appearance", "Preferences"). */
export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Txt variant="calloutMedium" tone="secondary">
        {title}
      </Txt>
      {trailing}
    </View>
  );
}

type BadgeVariant = 'outline' | 'secondary' | 'default' | 'success' | 'warning' | 'destructive';

/** 22px pill badge. */
export function Badge({
  label,
  variant = 'outline',
  dot,
  mono = false,
}: {
  label: string;
  variant?: BadgeVariant;
  /** Leading status dot colour. */
  dot?: string;
  mono?: boolean;
}) {
  const { colors } = useTheme();
  const look = {
    outline: { bg: 'transparent', fg: colors.foreground, border: colors.border },
    secondary: { bg: colors.muted, fg: colors.mutedForeground, border: 'transparent' },
    default: { bg: colors.primary, fg: colors.primaryForeground, border: 'transparent' },
    success: { bg: colors.successSoft, fg: colors.success, border: 'transparent' },
    warning: { bg: colors.warningSoft, fg: colors.warning, border: 'transparent' },
    destructive: { bg: colors.destructiveSoft, fg: colors.destructive, border: 'transparent' },
  }[variant];
  return (
    <View style={[styles.badge, { backgroundColor: look.bg, borderColor: look.border }]}>
      {dot ? <View style={[styles.badgeDot, { backgroundColor: dot }]} /> : null}
      <Txt variant={mono ? 'mono' : 'label'} color={look.fg} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Circular initials avatar on the muted fill. */
export function Avatar({ initials, size = 32 }: { initials: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt
        style={{ fontSize: Math.round(size * 0.375), lineHeight: Math.round(size * 0.5) }}
        variant="label"
        tone={size > 40 ? 'primary' : 'secondary'}
      >
        {initials}
      </Txt>
    </View>
  );
}

/** Icon tile: a small rounded square on the muted fill (suggestion cards, stats). */
export function IconTile({ children, size = 30 }: { children: ReactNode; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.md,
        backgroundColor: colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

/** Grouped list card (the design's "Preferences" block): rows split by hairlines. */
export function ListGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {items.map((child, i) => (
        <View key={i}>
          {i > 0 ? <View style={[styles.groupDivider, { backgroundColor: colors.border }]} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

/** One row in a ListGroup: icon tile, title, value or control, chevron when it navigates. */
export function ListItem({
  icon: Icon,
  title,
  description,
  value,
  trailing,
  onPress,
  destructive = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  value?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const fg = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.muted }]}
    >
      {Icon ? (
        <IconTile>
          <Icon size={16} color={fg} strokeWidth={1.75} />
        </IconTile>
      ) : null}
      <View style={styles.flex}>
        <Txt variant="body" color={fg} style={styles.itemTitle} numberOfLines={1}>
          {title}
        </Txt>
        {description ? (
          <Txt variant="caption" tone="secondary">
            {description}
          </Txt>
        ) : null}
      </View>
      {value ? (
        <Txt variant="callout" tone="secondary" numberOfLines={1}>
          {value}
        </Txt>
      ) : null}
      {trailing}
      {onPress && !trailing && !destructive ? <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.75} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardDescription: { marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  group: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  groupDivider: { height: 1 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14 },
  itemTitle: { fontSize: 15 },
});
