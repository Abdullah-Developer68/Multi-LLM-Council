import { ArrowUp, Layers, Plus, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { control, elevation, fonts, makeStyles, radius, useTheme } from '@/theme';
import { IconButton } from '../ui/button';
import { Badge } from '../ui/layout';
import { Txt } from '../ui/text';
import { AttachSheet } from './attach-sheet';
import { AttachmentTray } from './attachment-tray';

const MIN_HEIGHT = 44;
const MAX_HEIGHT = 200;
const LIMIT = 8000;

/** Round primary send button; dims to 35% while there is nothing to send. */
function SendButton({ live, canSend, onSend, onStop }: { live: boolean; canSend: boolean; onSend: () => void; onStop: () => void }) {
  const { colors } = useTheme();
  const active = live || canSend;
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
      style={({ pressed }) => ({
        width: control.sm,
        height: control.sm,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        opacity: !active ? 0.35 : pressed ? 0.8 : 1,
      })}
    >
      {live ? (
        <Square size={11} color={colors.primaryForeground} fill={colors.primaryForeground} />
      ) : (
        <ArrowUp size={16} color={colors.primaryForeground} strokeWidth={2.25} />
      )}
    </Pressable>
  );
}

/** Composer card: auto-growing input, memory toggle, send/stop. */
export function Composer({ autoFocus = false }: { autoFocus?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const draft = useAppStore((s) => s.draft);
  const setDraft = useAppStore((s) => s.setDraft);
  const draftAttachments = useAppStore((s) => s.draftAttachments);
  const send = useAppStore((s) => s.send);
  const cancel = useAppStore((s) => s.cancel);
  const live = useAppStore((s) => !!s.live);
  const inThread = useAppStore((s) => !!s.activeThreadId);
  const contextEnabled = useAppStore((s) => s.contextEnabled);
  const setContextEnabled = useAppStore((s) => s.setContextEnabled);
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [focused, setFocused] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const hasUploading = draftAttachments.some((a) => a.status === 'uploading');
  const hasError = draftAttachments.some((a) => a.status === 'error');
  const hasReady = draftAttachments.some((a) => a.status === 'ready' && a.meta);
  const canSend =
    (draft.trim().length > 0 || hasReady) && draft.length <= LIMIT && !live && !hasUploading && !hasError;

  const submit = () => {
    if (!canSend) return;
    void send(draft, { fromComposer: true });
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
      <View style={[styles.box, { borderColor: focused ? colors.ring : colors.input }, elevation(colors)]}>
        <AttachmentTray />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onKeyPress={onKeyPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          multiline
          placeholder={inThread ? 'Ask a follow-up…' : 'Ask the council anything…'}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.foreground}
          onContentSizeChange={(e) =>
            setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(e.nativeEvent.contentSize.height))))
          }
          style={[styles.input, { height, color: colors.foreground }, Platform.OS === 'web' && styles.webInput]}
          accessibilityLabel="Message"
        />
        {hasError ? (
          <Txt variant="caption" tone="danger" style={styles.attachHint}>
            Remove or retry failed attachments before sending.
          </Txt>
        ) : hasUploading ? (
          <Txt variant="caption" tone="secondary" style={styles.attachHint}>
            Uploading attachments…
          </Txt>
        ) : null}
        <View style={styles.row}>
          <IconButton
            icon={Plus}
            variant="outline"
            round
            size={control.sm}
            label="Add attachment"
            disabled={live}
            onPress={() => {
              Keyboard.dismiss();
              setAttachOpen(true);
            }}
          />
          {inThread ? (
            <Pressable
              onPress={() => {
                haptic.select();
                setContextEnabled(!contextEnabled);
              }}
              style={({ pressed }) => [styles.tool, (contextEnabled || pressed) && { backgroundColor: colors.muted }]}
              accessibilityRole="switch"
              accessibilityState={{ checked: contextEnabled }}
              accessibilityLabel="Remember earlier messages"
            >
              <Layers size={15} color={contextEnabled ? colors.foreground : colors.mutedForeground} strokeWidth={1.75} />
              <Txt variant="calloutMedium" color={contextEnabled ? colors.foreground : colors.mutedForeground} style={styles.toolText}>
                Memory {contextEnabled ? 'on' : 'off'}
              </Txt>
            </Pressable>
          ) : (
            <View style={styles.hint}>
              <Badge label="3 models" variant="secondary" />
            </View>
          )}
          <View style={styles.flex} />
          {draft.length > LIMIT * 0.8 ? (
            <Txt variant="mono" tone={draft.length > LIMIT ? 'danger' : 'secondary'}>
              {draft.length}/{LIMIT}
            </Txt>
          ) : null}
          <SendButton live={live} canSend={canSend} onSend={submit} onStop={cancel} />
        </View>
      </View>
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} />
      {inThread ? null : (
        <Txt variant="label" tone="secondary" style={styles.disclaimer}>
          Council uses free AI models and can make mistakes.
        </Txt>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  outer: { gap: 8 },
  box: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 12,
    gap: 4,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 14.5,
    lineHeight: 22,
    paddingTop: 4,
    paddingBottom: 4,
    paddingHorizontal: 6,
    textAlignVertical: 'top',
  },
  webInput: { outlineStyle: 'none' } as object,
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: control.sm,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  toolText: { fontSize: 13 },
  hint: { paddingLeft: 4 },
  attachHint: { paddingHorizontal: 6, paddingBottom: 2 },
  disclaimer: { textAlign: 'center', fontFamily: fonts.regular },
  flex: { flex: 1 },
}));
