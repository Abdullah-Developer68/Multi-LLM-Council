import { Brain, LogOut, MessageSquare, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';
import type { ThreadSummary } from '@/types';

const ANIM_MS = 240;

export function HistoryDrawer() {
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const threads = useAppStore((s) => s.threads);
  const activeThreadId = useAppStore((s) => s.activeThreadId);
  const selectThread = useAppStore((s) => s.selectThread);
  const resetChat = useAppStore((s) => s.resetChat);
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.85, 340);

  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isSidebarOpen);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));

  // Keep the modal mounted while the closing animation plays.
  if (prevOpen !== isSidebarOpen) {
    setPrevOpen(isSidebarOpen);
    if (!isSidebarOpen) setClosing(true);
  }
  const mounted = isSidebarOpen || closing;

  useEffect(() => {
    if (isSidebarOpen) {
      Animated.timing(progress, {
        toValue: 1,
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: ANIM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setClosing(false);
      });
    }
  }, [isSidebarOpen, progress]);

  const close = () => setSidebarOpen(false);

  const handleNewSession = () => {
    resetChat();
    close();
  };

  const handleSelect = (thread: ThreadSummary) => {
    void selectThread(thread.id);
    close();
  };

  const handleLogout = () => {
    setConfirmLogout(false);
    close();
    void logout();
  };

  const initial = (user?.fullName?.trim().charAt(0) || user?.email?.charAt(0) || '?').toUpperCase();

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-drawerWidth, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Brain size={20} color={Colors.primaryLight} />
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Multi-Agent Council
            </Text>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close menu">
              <X size={20} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* New session */}
          <Pressable
            onPress={handleNewSession}
            style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
          >
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.newButtonText}>New Session</Text>
          </Pressable>

          <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>

          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.empty}>No sessions yet.</Text>}
            renderItem={({ item }) => {
              const active = item.id === activeThreadId;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => [
                    styles.threadItem,
                    active && styles.threadItemActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <MessageSquare
                    size={16}
                    color={active ? Colors.primaryLight : Colors.textMuted}
                  />
                  <Text
                    style={[styles.threadTitle, active && styles.threadTitleActive]}
                    numberOfLines={1}
                  >
                    {item.title || 'Untitled session'}
                  </Text>
                </Pressable>
              );
            }}
          />

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {user?.fullName ?? 'Guest'}
              </Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email ?? ''}
              </Text>
            </View>
            <Pressable
              onPress={() => setConfirmLogout(true)}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
              accessibilityLabel="Log Out"
            >
              <LogOut size={16} color={Colors.error} />
              <Text style={styles.logoutText}>Log Out</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Logout confirmation */}
        {confirmLogout ? (
          <View style={styles.confirmOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmLogout(false)} />
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Log out?</Text>
              <Text style={styles.confirmBody}>
                You will need to sign in again to access your sessions.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setConfirmLogout(false)}
                  style={({ pressed }) => [styles.confirmCancel, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleLogout}
                  style={({ pressed }) => [styles.confirmOk, pressed && styles.pressed]}
                >
                  <Text style={styles.confirmOkText}>Log Out</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2, 6, 23, 0.65)' },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.sidebar,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  newButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 10, paddingBottom: 12 },
  empty: { color: Colors.textMuted, fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 },
  threadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginBottom: 2,
  },
  threadItemActive: { backgroundColor: Colors.accent },
  threadTitle: { flex: 1, color: Colors.textSecondary, fontSize: 14 },
  threadTitleActive: { color: Colors.accentForeground, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  userEmail: { color: Colors.textMuted, fontSize: 12 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.errorBorder,
    backgroundColor: Colors.errorBg,
  },
  logoutText: { color: Colors.error, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  confirmOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: 20,
  },
  confirmTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '700' },
  confirmBody: { color: Colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  confirmCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHigh,
  },
  confirmCancelText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  confirmOk: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.error,
  },
  confirmOkText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
