import { usePathname } from 'expo-router';
import { ChartColumn, Cpu, EllipsisVertical, MessageSquare, Pin, Plus, Search, Settings, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedStyle, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Wordmark } from '@/components/brand';
import { initials } from '@/lib/format';
import { navigateTo, type AppRoute } from '@/lib/nav';
import { useAppStore } from '@/store';
import type { ThreadSummary } from '@/shared/types';
import { control, fonts, layout, makeStyles, radius, springs, useTheme } from '@/theme';
import { IconButton } from '../ui/button';
import { Segmented } from '../ui/controls';
import { Skeleton } from '../ui/feedback';
import { Avatar } from '../ui/layout';
import { Txt } from '../ui/text';
import { ThreadActions } from './thread-actions';

function useDrawerWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width * 0.82, layout.drawerMaxWidth);
}

const DAY = 86_400_000;
const GROUP_ORDER = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];
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

/** One chat in the history: 40px row, muted fill when active; long-press or ⋮ for actions. */
function ThreadRow({
  thread,
  active,
  onPress,
  onMenu,
}: {
  thread: ThreadSummary;
  active: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      delayLongPress={350}
      style={({ pressed }) => [styles.thread, (active || pressed) && styles.threadActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityHint="Long-press for rename, pin and delete"
    >
      {thread.pinned ? <Pin size={13} color={colors.faint} strokeWidth={1.75} /> : null}
      <Txt
        variant={active ? 'bodyMedium' : 'body'}
        tone={active ? 'primary' : 'secondary'}
        style={[styles.flex, styles.threadText]}
        numberOfLines={1}
      >
        {thread.title}
      </Txt>
      {active ? (
        <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel={`Options for ${thread.title}`} style={styles.more}>
          <EllipsisVertical size={16} color={colors.mutedForeground} strokeWidth={1.75} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/** Drawer body: brand, section tabs, search + new chat, grouped history, account footer. */
function DrawerContent({ onClose }: { onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pathname = usePathname();
  const threads = useAppStore((s) => s.threads);
  const status = useAppStore((s) => s.threadsStatus);
  const loadThreads = useAppStore((s) => s.loadThreads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const openThread = useAppStore((s) => s.openThread);
  const newChat = useAppStore((s) => s.newChat);
  const user = useAppStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [menuThread, setMenuThread] = useState<ThreadSummary | null>(null);

  // Debounced server-side search over titles and prompts.
  useEffect(() => {
    const id = setTimeout(() => void loadThreads(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query, loadThreads]);

  const go = (path: AppRoute) => {
    onClose();
    navigateTo(pathname, path);
  };

  const grouped = threads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
    (acc[group(t)] ??= []).push(t);
    return acc;
  }, {});
  const sections = GROUP_ORDER.filter((g) => grouped[g]?.length).map((title) => ({ title, data: grouped[title] }));

  return (
    <View style={styles.content}>
      <View style={styles.top}>
        <Wordmark />
        <IconButton icon={X} label="Close sidebar" onPress={onClose} color={colors.mutedForeground} />
      </View>

      <Segmented<AppRoute>
        value="/"
        onChange={(path) => go(path)}
        options={[
          { value: '/', icon: MessageSquare, label: 'Chats' },
          { value: '/council', icon: Cpu, label: 'Status' },
          { value: '/insights', icon: ChartColumn, label: 'Insights' },
        ]}
      />

      <View style={styles.searchRow}>
        <View style={[styles.search, { borderColor: searchFocused ? colors.ring : colors.input }]}>
          <Search size={16} color={colors.mutedForeground} strokeWidth={1.75} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search chats"
            placeholderTextColor={colors.mutedForeground}
            selectionColor={colors.foreground}
            style={[styles.searchInput, { color: colors.foreground }]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search chats"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <X size={15} color={colors.mutedForeground} strokeWidth={1.75} />
            </Pressable>
          ) : null}
        </View>
        <IconButton
          icon={Plus}
          label="New chat"
          variant="default"
          round
          size={control.lg}
          onPress={() => {
            newChat();
            onClose();
          }}
        />
      </View>

      {status === 'loading' && !threads.length ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={16} width={`${85 - i * 9}%`} />
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
            <Txt variant="label" tone="secondary" style={styles.groupTitle}>
              {section.title}
            </Txt>
          )}
          renderItem={({ item }) => (
            <ThreadRow
              thread={item}
              active={item.id === activeThreadId}
              onPress={() => {
                void openThread(item.id);
                onClose();
              }}
              onMenu={() => setMenuThread(item)}
            />
          )}
          ListEmptyComponent={
            <Animated.View entering={FadeIn} style={styles.empty}>
              <View style={[styles.emptyIcon, { borderColor: colors.input }]}>
                {query ? (
                  <Search size={16} color={colors.mutedForeground} strokeWidth={1.75} />
                ) : (
                  <MessageSquare size={16} color={colors.mutedForeground} strokeWidth={1.75} />
                )}
              </View>
              <Txt variant="calloutMedium" style={styles.center}>
                {query ? 'No matches' : 'No chats yet'}
              </Txt>
              <Txt variant="caption" tone="secondary" style={styles.center}>
                {query ? 'No chats match that search.' : 'Your conversations will be listed here, grouped by day.'}
              </Txt>
            </Animated.View>
          }
          contentContainerStyle={[styles.listContent, !sections.length && styles.listEmpty]}
        />
      )}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Avatar initials={initials(user?.fullName, user?.email)} />
        <View style={styles.flex}>
          <Txt variant="bodyMedium" numberOfLines={1}>
            {user?.fullName ?? 'Account'}
          </Txt>
          <Txt variant="caption" tone="secondary" numberOfLines={1}>
            {user?.email}
          </Txt>
        </View>
        <IconButton icon={Settings} label="Settings" onPress={() => go('/settings')} color={colors.mutedForeground} size={36} />
      </View>

      <ThreadActions thread={menuThread} onClose={() => setMenuThread(null)} />
    </View>
  );
}

/** Swipe-out drawer. `progress` (0 → 1) is shared with the chat screen. */
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
          style={[
            styles.drawer,
            { width, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 8, borderColor: colors.border },
            panelStyle,
          ]}
          accessibilityViewIsModal={open}
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        >
          <DrawerContent onClose={() => setOpen(false)} />
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  content: { flex: 1, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: control.md, paddingLeft: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: control.lg,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: c.card,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 14.5, paddingVertical: 0, height: '100%' },
  groupTitle: { paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingLeft: 10,
    paddingRight: 6,
    marginBottom: 1,
    borderRadius: radius.md,
  },
  threadActive: { backgroundColor: c.muted },
  threadText: { fontSize: 15 },
  more: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  skeletons: { gap: 14, paddingTop: 16, paddingHorizontal: 8 },
  listContent: { paddingBottom: 12 },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 48 },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  center: { textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 4, borderTopWidth: 1 },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 12,
    backgroundColor: c.background,
    borderRightWidth: 1,
    borderTopRightRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  flex: { flex: 1 },
}));
