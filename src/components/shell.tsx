import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { goBack } from '@/lib/nav';
import { layout, useTheme } from '@/theme';
import { IconButton } from './ui/button';
import { Txt } from './ui/text';

/**
 * Phone screen frame. `surface="card"` is the chat surface (the design's
 * #141414); `surface="background"` is the near-black ground that grouped
 * cards sit on (settings, status, pricing).
 */
export function Screen({
  header,
  children,
  overlay,
  surface = 'background',
}: {
  header: ReactNode;
  children: ReactNode;
  overlay?: ReactNode;
  surface?: 'card' | 'background';
}) {
  const { colors } = useTheme();
  const bg = colors[surface];
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: bg }}>
        {header}
      </SafeAreaView>
      <View style={styles.flex}>{children}</View>
      {overlay}
    </View>
  );
}

/** 56px phone header: leading control, centered title (+ subtitle), trailing control. */
export function AppHeader({
  title,
  subtitle,
  leading,
  trailing,
  onTitlePress,
  bordered = false,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onTitlePress?: () => void;
  bordered?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.header, bordered && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={styles.heading} pointerEvents="box-none">
        <Txt
          variant="headline"
          numberOfLines={1}
          style={styles.center}
          onPress={onTitlePress}
          accessibilityRole={onTitlePress ? 'button' : 'header'}
        >
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="caption" tone="secondary" style={styles.center} numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      <View style={styles.side}>{leading}</View>
      <View style={styles.flex} />
      <View style={[styles.side, styles.trailing]}>{trailing}</View>
    </View>
  );
}

/** Back chevron for pushed screens. */
export function BackButton() {
  const { colors } = useTheme();
  return <IconButton icon={ChevronLeft} label="Back" onPress={goBack} size={40} color={colors.foreground} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  side: { flexDirection: 'row', alignItems: 'center', minWidth: 40 },
  trailing: { justifyContent: 'flex-end', gap: 4 },
  heading: { position: 'absolute', left: 72, right: 72, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
