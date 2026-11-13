import { CircleAlert, Menu, RotateCcw, SquarePen, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Composer } from '@/components/chat/composer';
import { EmptyState } from '@/components/chat/empty-state';
import { HistoryDrawer, useDrawerWidth } from '@/components/chat/history-drawer';
import { LiveTurnView, TurnView } from '@/components/chat/turn';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { MonoLabel, Txt } from '@/components/ui/text';
import { useAppStore } from '@/store';
import { makeStyles, radius, springs, useTheme } from '@/theme';

function Header() {
  const styles = useStyles();
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const newChat = useAppStore((s) => s.newChat);
  const title = useAppStore((s) => s.activeTitle ?? (s.live && !s.activeThreadId ? s.live.title : null));
  const turnCount = useAppStore((s) => s.turns.length);
  const hasThread = useAppStore((s) => !!s.activeThreadId);

  return (
    <View style={styles.header}>
      <IconButton icon={Menu} label="Open conversations" onPress={() => setDrawerOpen(true)} />
      <View style={styles.headerCenter}>
        <Txt variant="calloutMedium" numberOfLines={1}>
          {title ?? 'New conversation'}
        </Txt>
        <MonoLabel>{hasThread ? `${turnCount} ${turnCount === 1 ? 'turn' : 'turns'}` : 'Council of three'}</MonoLabel>
      </View>
      <IconButton icon={SquarePen} label="New conversation" onPress={newChat} disabled={!hasThread} />
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
          The council couldn’t answer
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
      <Skeleton width={90} height={10} />
      <Skeleton width="70%" height={20} />
      <Skeleton height={36} style={{ borderRadius: 8 }} />
      <Skeleton height={220} style={{ borderRadius: radius.lg }} />
    </Animated.View>
  );
}

function Conversation() {
  const styles = useStyles();
  const turns = useAppStore((s) => s.turns);
  const live = useAppStore((s) => (s.live && s.live.originThreadId === s.activeThreadId ? s.live : null));
  const status = useAppStore((s) => s.threadStatus);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const hasError = useAppStore((s) => !!s.chatError);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const liveId = live?.id ?? null;

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 140);
    return () => clearTimeout(id);
  }, [turns.length, liveId, activeThreadId, hasError]);

  if (!turns.length && !live && status !== 'loading' && !hasError) return <EmptyState />;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.conversation}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {status === 'loading' ? <ThreadSkeleton /> : null}
      {turns.map((turn, i) => (
        <TurnView key={turn.turnId} turn={turn} index={i + 1} />
      ))}
      {live ? <LiveTurnView live={live} index={turns.length + 1} /> : null}
      <ErrorBanner />
    </ScrollView>
  );
}

export default function ChatScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const drawerWidth = useDrawerWidth();
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(drawerOpen ? 1 : 0, springs.gentle));
  }, [drawerOpen, progress]);

  // Swipe from the left edge to open the history drawer.
  const edgePan = usePanGesture({
    activeOffsetX: 10,
    failOffsetY: [-16, 16],
    onUpdate: (e) => {
      'worklet';
      progress.set(Math.min(1, Math.max(0, e.translationX / drawerWidth)));
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

  // The page recedes slightly while the drawer is open.
  const mainStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.get(), [0, 1], [0, 28]) },
      { scale: interpolate(progress.get(), [0, 1], [1, 0.985]) },
    ],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.root, mainStyle]}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeTop}>
          <Header />
        </SafeAreaView>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.flex}>
            <Conversation />
          </View>
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Composer />
          </View>
        </KeyboardAvoidingView>
      </Animated.View>

      <GestureDetector gesture={edgePan}>
        <View style={[styles.edge, { top: insets.top + 64 }]} />
      </GestureDetector>

      <HistoryDrawer progress={progress} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  safeTop: { backgroundColor: c.bg, borderBottomWidth: 1, borderColor: c.border },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6 },
  headerCenter: { flex: 1, alignItems: 'center', gap: 2 },
  conversation: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12, width: '100%', maxWidth: 760, alignSelf: 'center' },
  composer: { paddingHorizontal: 12, paddingTop: 8, width: '100%', maxWidth: 784, alignSelf: 'center' },
  edge: { position: 'absolute', left: 0, bottom: 120, width: 18 },
  skeleton: { gap: 14, marginBottom: 24 },
  error: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, marginBottom: 16 },
  errorBody: { flex: 1, gap: 4 },
  errorActions: { flexDirection: 'row', marginTop: 8 },
}));
