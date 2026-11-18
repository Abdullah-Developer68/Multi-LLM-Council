import { router } from 'expo-router';
import { Menu, RotateCcw, SquarePen, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View, type ScrollViewInstance } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Composer } from '@/components/chat/composer';
import { EmptyState } from '@/components/chat/empty-state';
import { LiveTurnView, TurnView } from '@/components/chat/messages';
import { DrawerSidebar } from '@/components/chat/sidebar';
import { AppHeader, Screen } from '@/components/shell';
import { Button, IconButton } from '@/components/ui/button';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/layout';
import { Txt } from '@/components/ui/text';
import { initials } from '@/lib/format';
import { useAppStore } from '@/store';
import { makeStyles, springs, useTheme } from '@/theme';

function Header() {
  const { colors } = useTheme();
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const newChat = useAppStore((s) => s.newChat);
  const user = useAppStore((s) => s.user);
  const hasThread = useAppStore((s) => !!s.activeThreadId);
  const title = useAppStore((s) => s.threads.find((t) => t.id === s.activeThreadId)?.title);

  return (
    <AppHeader
      title={hasThread ? (title ?? 'Conversation') : 'Council'}
      subtitle={hasThread ? 'Council · 3 models' : undefined}
      onTitlePress={() => router.push('/council')}
      bordered={hasThread}
      leading={<IconButton icon={Menu} label="Open sidebar" size={40} onPress={() => setDrawerOpen(true)} color={colors.foreground} />}
      trailing={
        hasThread ? (
          <IconButton icon={SquarePen} label="New chat" size={40} onPress={newChat} color={colors.foreground} />
        ) : (
          <Pressable onPress={() => router.push('/settings')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Settings">
            <Avatar initials={initials(user?.fullName, user?.email)} />
          </Pressable>
        )
      }
    />
  );
}

function ErrorBanner() {
  const styles = useStyles();
  const error = useAppStore((s) => s.chatError);
  const dismiss = useAppStore((s) => s.dismissError);
  const send = useAppStore((s) => s.send);
  if (!error) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.error}>
      <Alert title="Something went wrong">
        <View style={styles.errorBody}>
          <Txt variant="callout" tone="danger">
            {error.message}
          </Txt>
          <View style={styles.errorActions}>
            <Button label="Try again" size="sm" variant="outline" icon={RotateCcw} onPress={() => send(error.prompt)} />
            <Button label="Dismiss" size="sm" variant="ghost" icon={X} onPress={dismiss} />
          </View>
        </View>
      </Alert>
    </Animated.View>
  );
}

function ThreadSkeleton() {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeIn} style={styles.skeleton}>
      <Skeleton width="55%" height={44} style={{ alignSelf: 'flex-end', borderRadius: 14 }} />
      <Skeleton width="92%" />
      <Skeleton width="86%" />
      <Skeleton width="70%" />
    </Animated.View>
  );
}

/** The scrolling message list, or the new-chat screen when empty. */
function Conversation() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
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
          <EmptyState />
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
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Composer />
      </View>
    </>
  );
}

export default function ChatScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const drawerOpen = useAppStore((s) => s.drawerOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withSpring(drawerOpen ? 1 : 0, springs.gentle));
  }, [drawerOpen, progress]);

  // Swipe from the left edge to open the sidebar.
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

  return (
    <Screen
      surface="card"
      header={<Header />}
      overlay={
        <>
          <GestureDetector gesture={edgePan}>
            <View style={[styles.edge, { top: insets.top + 64 }]} />
          </GestureDetector>
          <DrawerSidebar progress={progress} />
        </>
      }
    >
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Conversation />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  flex: { flex: 1 },
  conversation: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  composer: { paddingHorizontal: 12, paddingTop: 8 },
  edge: { position: 'absolute', left: 0, bottom: 140, width: 18 },
  skeleton: { gap: 14, marginBottom: 28 },
  error: { marginBottom: 16 },
  errorBody: { gap: 10 },
  errorActions: { flexDirection: 'row', gap: 8 },
}));
