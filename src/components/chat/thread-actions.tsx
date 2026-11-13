import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import type { ThreadSummary } from '@/shared/types';
import { radius, useTheme } from '@/theme';
import { Button } from '../ui/button';
import { Sheet } from '../ui/sheet';
import { TextField } from '../ui/text-field';
import { Txt } from '../ui/text';

type Step = 'menu' | 'rename' | 'delete';

function ActionRow({
  icon: Icon,
  label,
  danger,
  onPress,
}: {
  icon: typeof Pin;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
      accessibilityRole="button"
    >
      <Icon size={18} color={danger ? colors.danger : colors.text} strokeWidth={1.7} />
      <Txt variant="body" tone={danger ? 'danger' : 'primary'}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Rename / pin / delete for one conversation. */
export function ThreadActions({ thread, onClose }: { thread: ThreadSummary | null; onClose: () => void }) {
  const renameThread = useAppStore((s) => s.renameThread);
  const togglePin = useAppStore((s) => s.togglePin);
  const deleteThread = useAppStore((s) => s.deleteThread);
  const [step, setStep] = useState<Step>('menu');
  const [title, setTitle] = useState('');
  const [prevId, setPrevId] = useState<string | null>(null);

  // Reset the sheet whenever it opens for a different thread.
  if ((thread?.id ?? null) !== prevId) {
    setPrevId(thread?.id ?? null);
    setStep('menu');
    setTitle(thread?.title ?? '');
  }

  const close = () => onClose();

  return (
    <Sheet visible={!!thread} onClose={close} title={thread?.title}>
      {thread && step === 'menu' ? (
        <View>
          <ActionRow icon={Pencil} label="Rename" onPress={() => setStep('rename')} />
          <ActionRow
            icon={thread.pinned ? PinOff : Pin}
            label={thread.pinned ? 'Unpin' : 'Pin to top'}
            onPress={() => {
              void togglePin(thread.id);
              close();
            }}
          />
          <ActionRow icon={Trash2} label="Delete" danger onPress={() => setStep('delete')} />
        </View>
      ) : null}

      {thread && step === 'rename' ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.stack}>
          <TextField value={title} onChangeText={setTitle} autoFocus maxLength={120} returnKeyType="done" />
          <View style={styles.buttons}>
            <Button label="Cancel" variant="secondary" onPress={() => setStep('menu')} />
            <Button
              label="Save"
              disabled={!title.trim()}
              onPress={() => {
                void renameThread(thread.id, title.trim());
                haptic.success();
                close();
              }}
            />
          </View>
        </Animated.View>
      ) : null}

      {thread && step === 'delete' ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.stack}>
          <Txt tone="secondary">This removes the conversation and every council answer in it. This can’t be undone.</Txt>
          <View style={styles.buttons}>
            <Button label="Keep it" variant="secondary" onPress={() => setStep('menu')} />
            <Button
              label="Delete conversation"
              variant="danger"
              icon={Trash2}
              onPress={() => {
                haptic.warn();
                void deleteThread(thread.id);
                close();
              }}
            />
          </View>
        </Animated.View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingVertical: 14, borderRadius: radius.sm },
  stack: { gap: 16, paddingTop: 4 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
