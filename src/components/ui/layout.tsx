import { router } from 'expo-router';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';
import { IconButton } from './button';
import { PressableScale } from './pressable-scale';
import { Label, Txt } from './text';

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
        padded && { padding: 16 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[{ height: 1, backgroundColor: colors.border, marginLeft: inset }, style]} />;
}

/** Section header: mono index + label, e.g. `[ 02 ]  APPEARANCE`. */
export function SectionHeader({ index, title, trailing }: { index?: string; title: string; trailing?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLeft}>
        {index ? <Label>[ {index} ]</Label> : null}
        <Label tone="secondary">{title}</Label>
      </View>
      {trailing}
    </View>
  );
}

/**
 * Editorial list row: a mono stamp on the left, title, a quiet category on
 * the right and a chevron — the "11.09 · Title · Product ›" pattern.
 */
export function ListRow({
  stamp,
  title,
  subtitle,
  meta,
  onPress,
  onLongPress,
  leading,
  trailing,
  active = false,
  showChevron = true,
}: {
  stamp?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  active?: boolean;
  showChevron?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={0.985}
      accessibilityRole="button"
      style={[styles.row, active && { backgroundColor: colors.surfaceMuted }]}
    >
      {leading}
      {stamp ? (
        <Txt variant="mono" tone="tertiary" style={styles.stamp}>
          {stamp}
        </Txt>
      ) : null}
      <View style={styles.rowBody}>
        <Txt variant="callout" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" tone="tertiary" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {meta ? (
        <Txt variant="caption" tone="tertiary">
          {meta}
        </Txt>
      ) : null}
      {trailing}
      {showChevron ? <ChevronRight size={15} color={colors.textTertiary} strokeWidth={1.7} /> : null}
    </PressableScale>
  );
}

/** Header for pushed screens: back button, title, optional trailing action. */
export function ScreenHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: colors.border }]}>
      <IconButton icon={ArrowLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Txt variant="bodyMedium" style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Txt>
      <View style={styles.headerTrailing}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  stamp: { width: 40 },
  rowBody: { flex: 1, gap: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center' },
  headerTrailing: { minWidth: 38, alignItems: 'flex-end' },
});
