import { router } from 'expo-router';
import { ChartColumn, Cpu, Ellipsis, PanelLeftClose, Pin, Search, SquarePen, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, SectionList, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedStyle, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Wordmark } from '@/components/brand';
import { initials } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import type { ThreadSummary } from '@/shared/types';
import { fonts, makeStyles, radius, springs, useTheme } from '@/theme';
import { IconButton } from '../ui/button';
import { Skeleton } from '../ui/feedback';
import { Txt } from '../ui/text';
import { ThreadActions } from './thread-actions';

export const SIDEBAR_WIDTH = 268;

/** Wide layouts (tablet / desktop web) keep the sidebar on screen. */
export function useIsWide() {
  return useWindowDimensions().width >= 900;
}

function useDrawerWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width * 0.84, 320);
}

const DAY = 86_400_000;
function group(t: ThreadSummary): string {
  if (t.pinned) return 'Pinned';
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const at = new Date(t.updatedAt).getTime();
  if (at >= start.getTime()) return 'Today';
  if (at >= start.getTime() - DAY) return 'Yesterday';
  if (at >= start.getTime() - 7 * DAY) return 'Previous 7 days';
  return 'Older';
}

function Row({
  icon,
  label,
  onPress,
  active = false,
  trailing,
}: {
  icon?: ReactNode;
  label: string;
  onPress: () => void;
  active?: boolean;
  trailing?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (active || pressed || hovered) && styles.rowActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {icon}
      <Txt variant="callout" style={styles.flex} numberOfLines={1}>
        {label}
      </Txt>
      {trailing}
    </Pressable>
  );
}

/** Sidebar body: new chat, search, navigation, grouped chat history and account. */
export function SidebarContent({ onClose, mode }: { onClose: () => void; mode: 'drawer' | 'docked' }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const threads = useAppStore((s) => s.threads);
  const status = useAppStore((s) => s.threadsStatus);
  const loadThreads = useAppStore((s) => s.loadThreads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const openThread = useAppStore((s) => s.openThread);
  const newChat = useAppStore((s) => s.newChat);
  const user = useAppStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [menuThread, setMenuThread] = useState<ThreadSummary | null>(null);

  // Debounced server-side search over titles and prompts.
  useEffect(() => {
    const id = setTimeout(() => void loadThreads(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query, loadThreads]);

  const afterNav = () => {
    if (mode === 'drawer') onClose();
  };
  const go = (path: '/settings' | '/council' | '/insights') => {
    afterNav();
    router.push(path);
  };

  const sections = Object.entries(
    threads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
      (acc[group(t)] ??= []).push(t);
      return acc;
    }, {}),
  ).map(([title, data]) => ({ title, data }));

  return (
    <View style={styles.content}>
      <View style={styles.top}>
        <Wordmark size={18} />
        <IconButton
          icon={mode === 'drawer' ? X : PanelLeftClose}
          label={mode === 'drawer' ? 'Close sidebar' : 'Hide sidebar'}
          onPress={onClose}
          size={34}
          color={colors.textSecondary}
        />
      </View>

      <Row
        icon={<SquarePen size={18} color={colors.text} strokeWidth={1.8} />}
        label="New chat"
        onPress={() => {
          haptic.tap();
          newChat();
          afterNav();
        }}
      />
      <View style={styles.search}>
        <Search size={17} color={colors.textTertiary} strokeWidth={1.8} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search chats"
          placeholderTextColor={colors.textTertiary}
          style={[styles.searchInput, { color: colors.text }, Platform.OS === 'web' && styles.webInput]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <X size={15} color={colors.textTertiary} />
          </Pressable>
        ) : null}
      </View>
      <Row icon={<Cpu size={18} color={colors.text} strokeWidth={1.8} />} label="Council status" onPress={() => go('/council')} />
      <Row icon={<ChartColumn size={18} color={colors.text} strokeWidth={1.8} />} label="Insights" onPress={() => go('/insights')} />

      {status === 'loading' && !threads.length ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={18} width={`${85 - i * 9}%`} />
          ))}
        </View>
      ) : (
        <SectionList
          style={styles.flex}
          sections={sections}
          keyExtractor={(t) => t.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          renderSectionHeader={({ section }) => (
            <Txt variant="label" tone="tertiary" style={styles.groupTitle}>
              {section.title}
            </Txt>
          )}
          renderItem={({ item }) => (
            <Row
              label={item.title}
              active={item.id === activeThreadId}
              onPress={() => {
                void openThread(item.id);
                afterNav();
              }}
              trailing={
                <View style={styles.trailing}>
                  {item.pinned ? <Pin size={13} color={colors.textTertiary} strokeWidth={1.8} /> : null}
                  <Pressable onPress={() => setMenuThread(item)} hitSlop={8} accessibilityLabel={`Options for ${item.title}`}>
                    <Ellipsis size={17} color={colors.textTertiary} strokeWidth={1.8} />
                  </Pressable>
                </View>
              }
            />
          )}
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={styles.empty}>
              <Txt variant="callout" tone="tertiary">
                {query ? 'No chats match that search.' : 'Your chats will show up here.'}
              </Txt>
            </Animated.View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <Pressable
        onPress={() => go('/settings')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [styles.user, (pressed || hovered) && styles.rowActive]}
        accessibilityRole="button"
        accessibilityLabel="Settings"
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Txt variant="label" color={colors.onPrimary}>
            {initials(user?.fullName, user?.email)}
          </Txt>
        </View>
        <View style={styles.flex}>
          <Txt variant="calloutMedium" numberOfLines={1}>
            {user?.fullName ?? 'Account'}
          </Txt>
          <Txt variant="caption" tone="tertiary" numberOfLines={1}>
            {user?.email}
          </Txt>
        </View>
      </Pressable>

      <ThreadActions thread={menuThread} onClose={() => setMenuThread(null)} />
    </View>
  );
}

/** Persistent sidebar for wide screens. */
export function DockedSidebar() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  return (
    <View style={[styles.docked, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <SidebarContent mode="docked" onClose={() => setCollapsed(true)} />
    </View>
  );
}

/** Swipe-out drawer for phones. `progress` (0 → 1) is shared with the chat screen. */
export function DrawerSidebar({ progress }: { progress: SharedValue<number> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const width = useDrawerWidth();
  const open = useAppStore((s) => s.drawerOpen);
  const setOpen = useAppStore((s) => s.setDrawerOpen);

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      progress.set(Math.min(1, Math.max(0, 1 + e.translationX / width)));
    },
    onDeactivate: (e) => {
      'worklet';
      if (progress.get() < 0.65 || e.velocityX < -600) {
        progress.set(withSpring(0, springs.gentle));
        scheduleOnRN(setOpen, false);
      } else {
        progress.set(withSpring(1, springs.gentle));
      }
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.get(), [0, 1], [-width - 20, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close sidebar" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.drawer, { width, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }, panelStyle]}
          accessibilityViewIsModal={open}
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        >
          <SidebarContent mode="drawer" onClose={() => setOpen(false)} />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  content: { flex: 1, paddingHorizontal: 8, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 38,
    paddingHorizontal: 10,
    borderRadius: radius.sm + 2,
  },
  rowActive: { backgroundColor: c.hover },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: radius.sm + 2,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14, paddingVertical: 0 },
  webInput: { outlineStyle: 'none' } as object,
  groupTitle: { paddingHorizontal: 10, paddingTop: 18, paddingBottom: 6 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skeletons: { gap: 14, paddingTop: 24, paddingHorizontal: 10 },
  listContent: { paddingBottom: 12 },
  empty: { paddingHorizontal: 10, paddingTop: 24 },
  user: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, marginTop: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  docked: { flex: 1, width: SIDEBAR_WIDTH, backgroundColor: c.sidebar, borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: c.sidebar },
  flex: { flex: 1 },
}));
