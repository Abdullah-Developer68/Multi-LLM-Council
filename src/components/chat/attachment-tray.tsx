import { Image } from 'expo-image';
import { RotateCcw, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { formatBytes, kindLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import type { DraftAttachment } from '@/store/types';
import { makeStyles, radius, useTheme } from '@/theme';
import { Txt } from '../ui/text';
import { AttachmentKindIcon } from './attachment-icon';

function RemoveButton({ name, onPress }: { name: string; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Remove ${name}`}
      style={({ pressed }) => [styles.remove, pressed && { backgroundColor: colors.muted }]}
    >
      <X size={12} color={colors.foreground} strokeWidth={1.75} />
    </Pressable>
  );
}

function ImageTile({
  item,
  onRemove,
  onRetry,
}: {
  item: DraftAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isError = item.status === 'error';
  const isUploading = item.status === 'uploading';

  return (
    <View style={styles.itemWrap}>
      <Pressable
        onPress={isError ? onRetry : undefined}
        disabled={!isError}
        accessibilityRole={isError ? 'button' : 'image'}
        accessibilityLabel={isError ? `Retry uploading ${item.name}` : item.name}
        style={({ pressed }) => [
          styles.imageTile,
          { borderColor: isError ? colors.destructive : colors.border },
          isError && pressed && styles.pressed,
        ]}
      >
        <Image source={{ uri: item.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        {isUploading ? (
          <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
            <ActivityIndicator size="small" color={colors.foreground} />
          </View>
        ) : null}
        {isError ? (
          <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
            <RotateCcw size={16} color={colors.destructive} strokeWidth={1.75} />
            <Txt variant="label" tone="danger">
              Retry
            </Txt>
          </View>
        ) : null}
      </Pressable>
      <RemoveButton name={item.name} onPress={onRemove} />
    </View>
  );
}

function FileTile({
  item,
  onRemove,
  onRetry,
}: {
  item: DraftAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const isError = item.status === 'error';
  const isUploading = item.status === 'uploading';

  return (
    <View style={styles.itemWrap}>
      <Pressable
        onPress={isError ? onRetry : undefined}
        disabled={!isError}
        accessibilityRole={isError ? 'button' : undefined}
        accessibilityLabel={isError ? `Retry uploading ${item.name}` : item.name}
        style={({ pressed }) => [
          styles.fileTile,
          { borderColor: isError ? colors.destructive : colors.border },
          isError && pressed && styles.pressed,
        ]}
      >
        <View style={styles.fileIcon}>
          {isUploading ? (
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          ) : isError ? (
            <RotateCcw size={16} color={colors.destructive} strokeWidth={1.75} />
          ) : (
            <AttachmentKindIcon kind={item.kind} size={16} color={colors.foreground} strokeWidth={1.75} />
          )}
        </View>
        <View style={styles.fileText}>
          <Txt variant="calloutMedium" numberOfLines={1} ellipsizeMode="middle">
            {item.name}
          </Txt>
          {isError ? (
            <Txt variant="caption" tone="danger" numberOfLines={1}>
              Retry
            </Txt>
          ) : (
            <Txt variant="caption" tone="secondary" numberOfLines={1}>
              {kindLabel(item.kind)} · {formatBytes(item.size)}
            </Txt>
          )}
        </View>
      </Pressable>
      <RemoveButton name={item.name} onPress={onRemove} />
    </View>
  );
}

/** Horizontal scroll tray of queued draft attachments above the composer input. */
export function AttachmentTray() {
  const styles = useStyles();
  const attachments = useAppStore((s) => s.draftAttachments);
  const removeAttachment = useAppStore((s) => s.removeAttachment);
  const retryAttachment = useAppStore((s) => s.retryAttachment);

  if (!attachments.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.tray}
    >
      {attachments.map((item) =>
        item.kind === 'image' ? (
          <ImageTile
            key={item.localId}
            item={item}
            onRemove={() => removeAttachment(item.localId)}
            onRetry={() => {
              haptic.tap();
              retryAttachment(item.localId);
            }}
          />
        ) : (
          <FileTile
            key={item.localId}
            item={item}
            onRemove={() => removeAttachment(item.localId)}
            onRetry={() => {
              haptic.tap();
              retryAttachment(item.localId);
            }}
          />
        ),
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  tray: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
    paddingBottom: 4,
    paddingLeft: 2,
    paddingRight: 8,
  },
  itemWrap: {
    position: 'relative',
  },
  imageTile: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: c.muted,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  fileTile: {
    height: 56,
    maxWidth: 200,
    minWidth: 132,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: c.muted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  fileIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: {
    flexShrink: 1,
    gap: 1,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: c.popover,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
}));
