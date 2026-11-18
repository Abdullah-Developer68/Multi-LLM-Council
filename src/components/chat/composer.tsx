import { ArrowUp, ChevronDown, Layers, Plus, Square } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import { ProviderLogo } from '@/components/provider-logo';
import { haptic } from '@/lib/haptics';
import { SEATS, shortModelName } from '@/shared/council';
import { useAppStore } from '@/store';
import { control, elevation, fonts, makeStyles, radius, useTheme } from '@/theme';
import { IconButton } from '../ui/button';
import { Txt } from '../ui/text';
import { AttachSheet } from './attach-sheet';
import { AttachmentTray } from './attachment-tray';
import { ModelPicker } from './model-picker';

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

/** Ghost model-picker trigger next to `+` in the composer's bottom row. */
function ModelButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const selectedModels = useAppStore((s) => s.selectedModels);
  const catalog = useAppStore((s) => s.catalog);

  const count = selectedModels.length;
  const resolveMeta = (id: string) => {
    const entry = catalog?.models.find((m) => m.id === id);
    const legacy = SEATS.find((s) => s.defaultModel === id || s.id === id);
    return {
      name: entry?.name ?? legacy?.name ?? shortModelName(id),
      company: entry?.company ?? legacy?.providerKey,
    };
  };

  const single = count === 1 ? resolveMeta(selectedModels[0]) : null;
  const label = single ? single.name : `${count} models`;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Choose models, ${single ? single.name : `${count} models selected`}`}
      style={({ pressed }) => [
        styles.modelButton,
        pressed && { backgroundColor: colors.muted },
        disabled && styles.disabled,
      ]}
    >
      {single ? (
        <ProviderLogo company={single.company} model={selectedModels[0]} size={16} />
      ) : (
        <View style={styles.stack}>
          {selectedModels.slice(0, 3).map((id, idx) => {
            const meta = resolveMeta(id);
            return (
              <View
                key={id}
                style={[
                  styles.stackCircle,
                  {
                    backgroundColor: colors.muted,
                    borderColor: colors.card,
                    marginLeft: idx === 0 ? 0 : -7,
                    zIndex: 3 - idx,
                  },
                ]}
              >
                <ProviderLogo company={meta.company} model={id} size={11} />
              </View>
            );
          })}
        </View>
      )}
      <Txt variant="calloutMedium" color={colors.foreground} numberOfLines={1} style={styles.modelLabel}>
        {label}
      </Txt>
      <ChevronDown size={16} color={colors.mutedForeground} strokeWidth={1.75} />
    </Pressable>
  );
}

/** Composer card: auto-growing input, model picker, memory toggle, send/stop. */
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
  const [pickerOpen, setPickerOpen] = useState(false);

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
          <ModelButton
            disabled={live}
            onPress={() => {
              haptic.select();
              Keyboard.dismiss();
              setPickerOpen(true);
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
              <Layers size={16} color={contextEnabled ? colors.foreground : colors.mutedForeground} strokeWidth={1.75} />
              <Txt variant="calloutMedium" color={contextEnabled ? colors.foreground : colors.mutedForeground} style={styles.toolText}>
                Memory {contextEnabled ? 'on' : 'off'}
              </Txt>
            </Pressable>
          ) : null}
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
      <ModelPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: control.sm,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    flexShrink: 1,
    minWidth: 0,
  },
  modelLabel: { fontSize: 13, flexShrink: 1, maxWidth: 140 },
  stack: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  stackCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: { opacity: 0.45 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: control.sm,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    flexShrink: 0,
  },
  toolText: { fontSize: 13 },
  attachHint: { paddingHorizontal: 6, paddingBottom: 2 },
  disclaimer: { textAlign: 'center', fontFamily: fonts.regular },
  flex: { flex: 1, minWidth: 0 },
}));
