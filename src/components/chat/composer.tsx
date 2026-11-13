import { ArrowUp, Layers, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { fonts, makeStyles, radius, springs, useTheme } from '@/theme';
import { MonoLabel, Txt } from '../ui/text';

const MIN_HEIGHT = 44;
const MAX_HEIGHT = 168;
const LIMIT = 8000;

function SendButton({ live, canSend, onSend, onStop }: { live: boolean; canSend: boolean; onSend: () => void; onStop: () => void }) {
  const { colors } = useTheme();
  const active = live || canSend;
  const progress = useDerivedValue(() => withSpring(active ? 1 : 0, springs.snappy), [active]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.surfaceSunken, colors.primary]),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.92, 1]) }],
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
      accessibilityLabel={live ? 'Stop the council' : 'Send to the council'}
    >
      <Animated.View style={[{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, style]}>
        {live ? (
          <Square size={13} color={colors.onPrimary} fill={colors.onPrimary} />
        ) : (
          <ArrowUp size={18} color={canSend ? colors.onPrimary : colors.textTertiary} strokeWidth={2.2} />
        )}
      </Animated.View>
    </Pressable>
  );
}

export function Composer() {
  const styles = useStyles();
  const { colors } = useTheme();
  const draft = useAppStore((s) => s.draft);
  const setDraft = useAppStore((s) => s.setDraft);
  const send = useAppStore((s) => s.send);
  const cancel = useAppStore((s) => s.cancel);
  const live = useAppStore((s) => !!s.live);
  const inThread = useAppStore((s) => !!s.activeThreadId);
  const contextEnabled = useAppStore((s) => s.contextEnabled);
  const setContextEnabled = useAppStore((s) => s.setContextEnabled);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [focused, setFocused] = useState(false);

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
    <View style={[styles.wrap, focused && { borderColor: colors.borderStrong }]}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onKeyPress={onKeyPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline
        placeholder={inThread ? 'Follow up with the council…' : 'Ask the council anything…'}
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
            style={[styles.chip, contextEnabled && { backgroundColor: colors.accentSoft, borderColor: 'transparent' }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: contextEnabled }}
            accessibilityLabel="Use earlier turns as context"
          >
            <Layers size={13} color={contextEnabled ? colors.accent : colors.textTertiary} strokeWidth={1.8} />
            <Txt variant="caption" color={contextEnabled ? colors.accent : colors.textTertiary}>
              {contextEnabled ? 'Memory on' : 'Memory off'}
            </Txt>
          </Pressable>
        ) : (
          <MonoLabel>3 seats · free models</MonoLabel>
        )}
        <View style={styles.flex} />
        {draft.length > LIMIT * 0.8 ? (
          <Txt variant="mono" tone={draft.length > LIMIT ? 'danger' : 'tertiary'}>
            {draft.length}/{LIMIT}
          </Txt>
        ) : null}
        <SendButton live={live} canSend={canSend} onSend={submit} onStop={cancel} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  input: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22, paddingTop: 10, paddingBottom: 6 },
  webInput: { outlineStyle: 'none' } as object,
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  flex: { flex: 1 },
}));
