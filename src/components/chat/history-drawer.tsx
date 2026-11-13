import { router } from 'expo-router';
import { ChartColumn, Cpu, Ellipsis, Pin, Search, Settings, SquarePen, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, SectionList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Wordmark } from '@/components/brand';
import { dateStamp, groupLabel, initials } from '@/lib/format';
import { useAppStore } from '@/store';
import type { ThreadSummary } from '@/shared/types';
import { makeStyles, radius, springs, useTheme } from '@/theme';
import { Button, IconButton } from '../ui/button';
import { Skeleton } from '../ui/feedback';
import { PressableScale } from '../ui/pressable-scale';
import { TextField } from '../ui/text-field';
import { MonoLabel, Txt } from '../ui/text';
import { ThreadActions } from './thread-actions';

export function useDrawerWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width * 0.86, 340);
}

function ThreadRow({
  thread,
  active,
  onOpen,
  onMore,
}: {
  thread: ThreadSummary;
  active: boolean;
  onOpen: () => void;
  onMore: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale
      scaleTo={0.985}
      onPress={onOpen}
      onLongPress={onMore}
      delayLongPress={350}
      style={[styles.thread, active && { backgroundColor: colors.surfaceMuted }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Txt variant="mono" tone="tertiary" style={styles.stamp} numberOfLines={1}>
        {dateStamp(thread.updatedAt)}
      </Txt>
      <View style={styles.flex}>
        <Txt variant="callout" numberOfLines={1}>
          {thread.title}
        </Txt>
        <Txt variant="caption" tone="tertiary">
          {thread.turnCount} {thread.turnCount === 1 ? 'turn' : 'turns'}
        </Txt>
      </View>
      {thread.pinned ? <Pin size={13} color={colors.textTertiary} strokeWidth={1.8} /> : null}
      <Pressable onPress={onMore} hitSlop={8} accessibilityLabel={`More actions for ${thread.title}`}>
        <Ellipsis size={17} color={colors.textTertiary} strokeWidth={1.7} />
      </Pressable>
    </PressableScale>
  );
}

/** Slide-in conversation history. `progress` (0 → 1) is owned by the chat screen. */
export function HistoryDrawer({ progress }: { progress: SharedValue<number> }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const width = useDrawerWidth();
  const open = useAppStore((s) => s.drawerOpen);
  const setOpen = useAppStore((s) => s.setDrawerOpen);
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

  const close = () => setOpen(false);
  const go = (path: '/settings' | '/council' | '/insights') => {
    close();
    router.push(path);
  };

  const sections = Object.entries(
    threads.reduce<Record<string, ThreadSummary[]>>((acc, t) => {
      (acc[groupLabel(t.updatedAt, t.pinned)] ??= []).push(t);
      return acc;
    }, {}),
  ).map(([title, data]) => ({ title, data }));

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
    transform: [{ translateX: interpolate(progress.get(), [0, 1], [-width - 24, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, backdropStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.panel, { width, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }, panelStyle]}
          accessibilityViewIsModal={open}
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
        >
          <View style={styles.header}>
            <Wordmark size={19} />
            <IconButton icon={X} label="Close menu" onPress={close} size={34} />
          </View>

          <View style={styles.top}>
            <Button
              label="New conversation"
              icon={SquarePen}
              fullWidth
              onPress={() => {
                newChat();
                close();
              }}
            />
            <TextField
              icon={Search}
              value={query}
              onChangeText={setQuery}
              placeholder="Search conversations"
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>

          {status === 'loading' && !threads.length ? (
            <View style={styles.skeletons}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} height={34} style={{ borderRadius: 8 }} />
              ))}
            </View>
          ) : (
            <SectionList
              style={styles.flex}
              sections={sections}
              keyExtractor={(t) => t.id}
              keyboardShouldPersistTaps="handled"
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <MonoLabel style={styles.sectionTitle}>{section.title}</MonoLabel>
              )}
              renderItem={({ item }) => (
                <ThreadRow
                  thread={item}
                  active={item.id === activeThreadId}
                  onOpen={() => {
                    void openThread(item.id);
                    close();
                  }}
                  onMore={() => setMenuThread(item)}
                />
              )}
              ListEmptyComponent={
                <Animated.View entering={FadeIn} style={styles.empty}>
                  <Txt variant="callout" tone="secondary">
                    {query ? 'No conversations match that search.' : 'No conversations yet.'}
                  </Txt>
                  {!query ? (
                    <Txt variant="caption" tone="tertiary">
                      Ask the council something to start one.
                    </Txt>
                  ) : null}
                </Animated.View>
              }
              contentContainerStyle={styles.listContent}
            />
          )}

          <View style={styles.footer}>
            <NavRow icon={Cpu} label="Council status" onPress={() => go('/council')} />
            <NavRow icon={ChartColumn} label="Insights" onPress={() => go('/insights')} />
            <PressableScale scaleTo={0.98} onPress={() => go('/settings')} style={styles.user} accessibilityRole="button" accessibilityLabel="Settings">
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
              <Settings size={17} color={colors.textSecondary} strokeWidth={1.7} />
            </PressableScale>
          </View>
        </Animated.View>
      </GestureDetector>

      <ThreadActions thread={menuThread} onClose={() => setMenuThread(null)} />
    </>
  );
}

function NavRow({ icon: Icon, label, onPress }: { icon: typeof Cpu; label: string; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <PressableScale scaleTo={0.98} onPress={onPress} style={styles.nav} accessibilityRole="link">
      <Icon size={17} color={colors.textSecondary} strokeWidth={1.7} />
      <Txt variant="callout" style={styles.flex}>
        {label}
      </Txt>
    </PressableScale>
  );
}

const useStyles = makeStyles((c) => ({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: c.bg,
    borderRightWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 6, marginBottom: 14 },
  top: { gap: 12, marginBottom: 8 },
  skeletons: { gap: 10, paddingTop: 16 },
  sectionTitle: { paddingHorizontal: 10, paddingTop: 16, paddingBottom: 6 },
  listContent: { paddingBottom: 12 },
  thread: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: radius.sm,
  },
  stamp: { width: 44 },
  empty: { paddingHorizontal: 10, paddingTop: 24, gap: 4 },
  footer: { borderTopWidth: 1, borderColor: c.border, paddingTop: 8, gap: 2 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, paddingVertical: 11, borderRadius: radius.sm },
  user: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.sm, marginTop: 4 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
}));
