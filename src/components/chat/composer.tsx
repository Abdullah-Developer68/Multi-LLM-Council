import { ArrowUp, Layers, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { fonts, makeStyles, radius, springs, useTheme } from '@/theme';
import { Txt } from '../ui/text';

const MIN_HEIGHT = 26;
const MAX_HEIGHT = 200;
const LIMIT = 8000;

function SendButton({ live, canSend, onSend, onStop }: { live: boolean; canSend: boolean; onSend: () => void; onStop: () => void }) {
  const { colors } = useTheme();
  const active = live || canSend;
  const progress = useDerivedValue(() => withSpring(active ? 1 : 0, springs.snappy), [active]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.hover, colors.primary]),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.94, 1]) }],
  }));
  return (
    <Pressable
      onPress={() => {
        if (live) {
          haptic.warn();
          onStop();
        } else if (canSend) {
          haptic.tap();
          onSend();
        }
      }}
      disabled={!active}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={live ? 'Stop generating' : 'Send message'}
    >
      <Animated.View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, style]}>
        {live ? (
          <Square size={12} color={colors.onPrimary} fill={colors.onPrimary} />
        ) : (
          <ArrowUp size={19} color={canSend ? colors.onPrimary : colors.textTertiary} strokeWidth={2.4} />
        )}
      </Animated.View>
    </Pressable>
  );
}

/** Rounded message box: auto-growing input, memory toggle, send/stop button. */
export function Composer({ autoFocus = false }: { autoFocus?: boolean }) {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const draft = useAppStore((s) => s.draft);
  const setDraft = useAppStore((s) => s.setDraft);
  const send = useAppStore((s) => s.send);
  const cancel = useAppStore((s) => s.cancel);
  const live = useAppStore((s) => !!s.live);
  const inThread = useAppStore((s) => !!s.activeThreadId);
  const contextEnabled = useAppStore((s) => s.contextEnabled);
  const setContextEnabled = useAppStore((s) => s.setContextEnabled);
  const [height, setHeight] = useState(MIN_HEIGHT);

  const canSend = draft.trim().length > 0 && draft.length <= LIMIT && !live;
  const submit = () => {
    if (!canSend) return;
    void send(draft);
    setHeight(MIN_HEIGHT);
  };

  // Web: Enter sends, Shift+Enter inserts a newline.
  const onKeyPress = (e: TextInputKeyPressEvent) => {
    if (Platform.OS !== 'web') return;
    const native = e.nativeEvent as { key: string; shiftKey?: boolean };
    if (native.key === 'Enter' && !native.shiftKey) {
      (e as unknown as { preventDefault: () => void }).preventDefault();
      submit();
    }
  };

  return (
    <View style={styles.outer}>
      <View style={[styles.box, scheme === 'light' && styles.boxLight]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onKeyPress={onKeyPress}
          autoFocus={autoFocus}
          multiline
          placeholder={inThread ? 'Ask a follow-up' : 'Ask anything'}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
          onContentSizeChange={(e) =>
            setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(e.nativeEvent.contentSize.height))))
          }
          style={[styles.input, { height, color: colors.text }, Platform.OS === 'web' && styles.webInput]}
          accessibilityLabel="Message"
        />
        <View style={styles.row}>
          {inThread ? (
            <Pressable
              onPress={() => {
                haptic.select();
                setContextEnabled(!contextEnabled);
              }}
              style={[styles.tool, contextEnabled && { backgroundColor: colors.accentSoft, borderColor: 'transparent' }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: contextEnabled }}
              accessibilityLabel="Remember earlier messages"
            >
              <Layers size={14} color={contextEnabled ? colors.accent : colors.textSecondary} strokeWidth={1.8} />
              <Txt variant="caption" color={contextEnabled ? colors.accent : colors.textSecondary}>
                Memory
              </Txt>
            </Pressable>
          ) : null}
          <View style={styles.flex} />
          {draft.length > LIMIT * 0.8 ? (
            <Txt variant="caption" tone={draft.length > LIMIT ? 'danger' : 'tertiary'}>
              {draft.length}/{LIMIT}
            </Txt>
          ) : null}
          <SendButton live={live} canSend={canSend} onSend={submit} onStop={cancel} />
        </View>
      </View>
      <Txt variant="caption" tone="tertiary" style={styles.disclaimer}>
        Council uses free AI models and can make mistakes. Check important info.
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  outer: { gap: 8 },
  box: {
    backgroundColor: c.composer,
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  boxLight: {
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  input: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24, paddingTop: 0, paddingBottom: 0, paddingHorizontal: 2 },
  webInput: { outlineStyle: 'none' } as object,
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  disclaimer: { textAlign: 'center' },
  flex: { flex: 1 },
}));
