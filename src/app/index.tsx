import { router } from 'expo-router';
import { ChevronRight, CircleAlert, Menu, PanelLeftOpen, RotateCcw, SquarePen, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Composer } from '@/components/chat/composer';
import { EmptyState } from '@/components/chat/empty-state';
import { LiveTurnView, TurnView } from '@/components/chat/messages';
import { DockedSidebar, DrawerSidebar, useIsWide } from '@/components/chat/sidebar';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Txt } from '@/components/ui/text';
import { useAppStore } from '@/store';
import { makeStyles, radius, springs, useTheme } from '@/theme';

const COLUMN = 768;

function Header({ wide }: { wide: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  const newChat = useAppStore((s) => s.newChat);
  const hasThread = useAppStore((s) => !!s.activeThreadId);
  const showSidebarButton = !wide || collapsed;

  return (
    <View style={styles.header}>
      {showSidebarButton ? (
        <IconButton
          icon={wide ? PanelLeftOpen : Menu}
          label="Open sidebar"
          onPress={() => (wide ? setCollapsed(false) : setDrawerOpen(true))}
          color={colors.textSecondary}
        />
      ) : null}
      {wide && collapsed ? <IconButton icon={SquarePen} label="New chat" onPress={newChat} color={colors.textSecondary} /> : null}
      <Pressable
        onPress={() => router.push('/council')}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
          styles.title,
          !wide && styles.titleCentered,
          (pressed || hovered) && { backgroundColor: colors.hover },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Council status"
      >
        <Txt variant="bodyMedium">Council</Txt>
        <Txt variant="body" tone="tertiary">
          3 models
        </Txt>
        <ChevronRight size={15} color={colors.textTertiary} strokeWidth={2} />
      </Pressable>
      <View style={styles.flex} />
      {!wide ? <IconButton icon={SquarePen} label="New chat" onPress={newChat} disabled={!hasThread} color={colors.textSecondary} /> : null}
    </View>
  );
}

function ErrorBanner() {
  const styles = useStyles();
  const { colors } = useTheme();
  const error = useAppStore((s) => s.chatError);
  const dismiss = useAppStore((s) => s.dismissError);
  const send = useAppStore((s) => s.send);
  if (!error) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={[styles.error, { backgroundColor: colors.dangerSoft }]}>
      <CircleAlert size={18} color={colors.danger} strokeWidth={1.8} />
      <View style={styles.errorBody}>
        <Txt variant="calloutMedium" tone="danger">
          Something went wrong
        </Txt>
        <Txt variant="caption" tone="danger">
          {error.message}
        </Txt>
        <View style={styles.errorActions}>
          <Button label="Try again" size="sm" icon={RotateCcw} onPress={() => send(error.prompt)} />
        </View>
      </View>
      <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Dismiss error">
        <X size={16} color={colors.danger} />
      </Pressable>
    </Animated.View>
  );
}

function ThreadSkeleton() {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeIn} style={styles.skeleton}>
      <Skeleton width="45%" height={40} style={{ alignSelf: 'flex-end', borderRadius: 20 }} />
      <Skeleton width="92%" />
      <Skeleton width="86%" />
      <Skeleton width="70%" />
    </Animated.View>
  );
}

/** The scrolling message list (or the new-chat screen when empty). */
function Conversation({ wide }: { wide: boolean }) {
  const styles = useStyles();
  const turns = useAppStore((s) => s.turns);
  const live = useAppStore((s) => (s.live && s.live.originThreadId === s.activeThreadId ? s.live : null));
  const status = useAppStore((s) => s.threadStatus);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const hasError = useAppStore((s) => !!s.chatError);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const liveId = live?.id ?? null;

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(id);
  }, [turns.length, liveId, activeThreadId, hasError]);

  const empty = !turns.length && !live && status !== 'loading' && !hasError;

  return (
    <>
      <View style={styles.flex}>
        {empty ? (
          <EmptyState centeredComposer={wide} />
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.conversation}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {status === 'loading' ? <ThreadSkeleton /> : null}
            {turns.map((turn) => (
              <TurnView key={turn.turnId} turn={turn} />
            ))}
            {live ? <LiveTurnView live={live} /> : null}
            <ErrorBanner />
          </ScrollView>
        )}
      </View>
      {empty && wide ? null : (
        <ComposerDock />
      )}
    </>
  );
}

function ComposerDock() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <Composer />
    </View>
  );
}

export default function ChatScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const wide = useIsWide();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(drawerOpen && !wide ? 1 : 0, springs.gentle));
  }, [drawerOpen, wide, progress]);

  // Phones: swipe from the left edge to open the sidebar.
  const edgePan = usePanGesture({
    activeOffsetX: 10,
    failOffsetY: [-16, 16],
    onUpdate: (e) => {
      'worklet';
      progress.set(Math.min(1, Math.max(0, e.translationX / 300)));
    },
    onDeactivate: (e) => {
      'worklet';
      if (progress.get() > 0.35 || e.velocityX > 500) {
        progress.set(withSpring(1, springs.gentle));
        scheduleOnRN(setDrawerOpen, true);
      } else {
        progress.set(withSpring(0, springs.gentle));
      }
    },
  });

  const mainStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(progress.get(), [0, 1], [0, 24]) }],
  }));

  return (
    <View style={styles.root}>
      {wide && !collapsed ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.dock}>
          <DockedSidebar />
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.main, mainStyle]}>
        <SafeAreaView edges={['top', 'right', ...(wide ? [] : (['left'] as const))]} style={styles.safeTop}>
          <Header wide={wide} />
        </SafeAreaView>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Conversation wide={wide} />
        </KeyboardAvoidingView>
      </Animated.View>

      {!wide ? (
        <>
          <GestureDetector gesture={edgePan}>
            <View style={[styles.edge, { top: insets.top + 64 }]} />
          </GestureDetector>
          <DrawerSidebar progress={progress} />
        </>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, flexDirection: 'row', backgroundColor: c.bg },
  main: { flex: 1, backgroundColor: c.bg },
  dock: { alignSelf: 'stretch' },
  flex: { flex: 1 },
  safeTop: { backgroundColor: c.bg },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 2 },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: radius.sm + 2,
  },
  titleCentered: { position: 'absolute', left: '50%', transform: [{ translateX: '-50%' }] },
  conversation: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, width: '100%', maxWidth: COLUMN, alignSelf: 'center' },
  composer: { paddingHorizontal: 12, paddingTop: 6, width: '100%', maxWidth: COLUMN + 24, alignSelf: 'center' },
  edge: { position: 'absolute', left: 0, bottom: 140, width: 18 },
  skeleton: { gap: 14, marginBottom: 28 },
  error: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, marginBottom: 16 },
  errorBody: { flex: 1, gap: 4 },
  errorActions: { flexDirection: 'row', marginTop: 8 },
}));
