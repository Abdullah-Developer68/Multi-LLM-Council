import { AlertCircle, Brain, Menu, SquarePen, X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthScreen } from '@/components/auth-screen';
import { ChatInputBar } from '@/components/chat-input-bar';
import { HistoryDrawer } from '@/components/history-drawer';
import { MultiAgentTurnCard } from '@/components/multi-agent-turn-card';
import { TypingIndicator } from '@/components/typing-indicator';
import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';

function AppBar() {
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const resetChat = useAppStore((s) => s.resetChat);

  return (
    <View style={styles.appBar}>
      <Pressable
        onPress={() => setSidebarOpen(true)}
        hitSlop={8}
        style={styles.iconButton}
        accessibilityLabel="Open menu"
      >
        <Menu size={22} color={Colors.textPrimary} />
      </Pressable>
      <Text style={styles.appTitle} numberOfLines={1}>
        Multi-Agent Council
      </Text>
      <Pressable
        onPress={resetChat}
        hitSlop={8}
        style={styles.iconButton}
        accessibilityLabel="New session"
      >
        <SquarePen size={20} color={Colors.textPrimary} />
      </Pressable>
    </View>
  );
}

function HeroView() {
  return (
    <ScrollView
      contentContainerStyle={styles.heroContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroIcon}>
        <Brain size={36} color={Colors.primaryLight} />
      </View>
      <Text style={styles.heroTitle}>How can I help you?</Text>
      <Text style={styles.heroSubtitle}>
        Your prompt is refined and answered by 3 AI models working together.
      </Text>
      <View style={styles.heroInput}>
        <ChatInputBar hero />
      </View>
    </ScrollView>
  );
}

function ChatView() {
  const turns = useAppStore((s) => s.turns);
  const activeStage = useAppStore((s) => s.activeStage);
  const chatError = useAppStore((s) => s.chatError);
  const clearChatError = useAppStore((s) => s.clearChatError);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const isGenerating =
    activeStage !== 'idle' && activeStage !== 'complete' && activeStage !== 'error';

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(id);
  }, [turns.length, isGenerating, chatError]);

  return (
    <>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {turns.map((turn) => (
          <MultiAgentTurnCard key={turn.turnId} turnId={turn.turnId} />
        ))}

        {isGenerating ? <TypingIndicator /> : null}

        {chatError ? (
          <View style={styles.errorBanner}>
            <AlertCircle size={16} color={Colors.error} />
            <Text style={styles.errorText}>{chatError}</Text>
            <Pressable onPress={clearChatError} hitSlop={8} accessibilityLabel="Dismiss error">
              <X size={16} color={Colors.error} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.inputWrap}>
        <ChatInputBar />
      </View>
    </>
  );
}

export default function HomeScreen() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const hasTurns = useAppStore((s) => s.turns.length > 0);
  const isGenerating = useAppStore(
    (s) => s.activeStage !== 'idle' && s.activeStage !== 'complete' && s.activeStage !== 'error',
  );
  const hasChatError = useAppStore((s) => s.chatError !== null);

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  const showChat = hasTurns || isGenerating || hasChatError;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <AppBar />
      <HistoryDrawer />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {showChat ? <ChatView /> : <HeroView />}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.background },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 54,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: { flex: 1, textAlign: 'center', color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },

  heroContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: { color: Colors.textPrimary, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  heroSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
    maxWidth: 320,
  },
  heroInput: { width: '100%', maxWidth: 640 },

  chatContent: { padding: 16, paddingBottom: 8 },
  inputWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.errorBg,
    borderColor: Colors.errorBorder,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: { color: Colors.error, fontSize: 13, flex: 1 },
});
