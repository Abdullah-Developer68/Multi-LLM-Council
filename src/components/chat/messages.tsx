import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { Check, ChevronLeft, ChevronRight, Copy, RefreshCw, Scale, Share2, ThumbsUp, TriangleAlert } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ProviderLogo } from '@/components/provider-logo';
import { formatBytes, formatLatency, kindLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { getSeat, seatIndex, shortModelName } from '@/shared/council';
import type { AttachmentMeta, CouncilTurn } from '@/shared/types';
import { useAppStore } from '@/store';
import type { LiveAttachment, LiveTurn } from '@/store/types';
import { fonts, makeStyles, radius, springs, useTheme } from '@/theme';
import { Badge, IconTile } from '../ui/layout';
import { Txt } from '../ui/text';
import { AttachmentKindIcon } from './attachment-icon';
import { MarkdownView } from './markdown';
import { ThinkingIndicator } from './thinking-indicator';
import { LiveRefinedPrompt, RefinedPrompt } from './refined-prompt';
import { fromLive, fromResponse, type SeatView } from './seat-view';

/* User message ------------------------------------------------------------- */

type DisplayAttachment = AttachmentMeta | LiveAttachment;

export function UserMessage({ text, attachments }: { text: string; attachments?: DisplayAttachment[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const list = attachments ?? [];

  return (
    <Animated.View entering={FadeInDown.springify().damping(22)} style={styles.userRow}>
      {list.length > 0 ? (
        <View style={styles.userAttachments}>
          {list.map((att) => {
            const uri = 'uri' in att ? att.uri : undefined;
            if (att.kind === 'image' && uri) {
              return (
                <View key={att.id} style={styles.userThumbWrap}>
                  <Image source={{ uri }} style={styles.userThumb} contentFit="cover" />
                </View>
              );
            }
            const displayName = att.kind === 'image' ? 'Photo' : att.name;
            const caption = `${kindLabel(att.kind)} · ${formatBytes(att.size)}${att.truncated ? ' · trimmed' : ''}`;
            return (
              <View key={att.id} style={styles.userChip}>
                <IconTile size={32}>
                  <AttachmentKindIcon kind={att.kind} size={16} color={colors.foreground} strokeWidth={1.75} />
                </IconTile>
                <View style={styles.userChipText}>
                  <Txt variant="calloutMedium" numberOfLines={1}>
                    {displayName}
                  </Txt>
                  <Txt variant="caption" tone="secondary" numberOfLines={1}>
                    {caption}
                  </Txt>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.userBubble}>
        <Txt variant="message" selectable>
          {text}
        </Txt>
      </View>
    </Animated.View>
  );
}

/* Seat switcher ------------------------------------------------------------ */

function StatusDot({ view }: { view: SeatView }) {
  const { colors } = useTheme();
  const live = view.phase !== 'done' && view.phase !== 'error';
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(live ? withRepeat(withSequence(withTiming(0.3, { duration: 550 }), withTiming(1, { duration: 550 })), -1) : withTiming(1));
  }, [live, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const color = view.phase === 'error' ? colors.destructive : (colors.seats[view.seatId] ?? colors.foreground);
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, style]} />;
}

function SeatChip({ view, active, onPress }: { view: SeatView; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const progress = useDerivedValue(() => withTiming(active ? 1 : 0, { duration: 180 }), [active]);
  const chipStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.card, colors.muted]),
    borderColor: interpolateColor(progress.get(), [0, 1], [colors.border, colors.input]),
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={view.name}
      style={styles.chipWrap}
    >
      <Animated.View style={[styles.chip, chipStyle]}>
        <ProviderLogo company={view.rotations ? undefined : view.company} model={view.model} size={14} />
        <Txt variant="label" tone={active ? 'primary' : 'secondary'} numberOfLines={1} style={styles.chipText}>
          {view.name}
        </Txt>
        {view.phase !== 'done' ? <StatusDot view={view} /> : null}
      </Animated.View>
    </Pressable>
  );
}

/* Assistant message -------------------------------------------------------- */

function ActionButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, pressed && styles.actionActive]}
    >
      {children}
    </Pressable>
  );
}

/**
 * One assistant turn. When multiple seats answered, shows one answer at a time
 * with model chips above it — swipe, tap a chip, or use ‹ 1/N ›.
 */
function AssistantMessage({
  views,
  selectionKey,
  turn,
}: {
  views: SeatView[];
  selectionKey: string;
  turn?: CouncilTurn;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const selection = useAppStore((s) => s.seatSelection[selectionKey]);
  const selectSeat = useAppStore((s) => s.selectSeat);
  const vote = useAppStore((s) => s.vote);
  const showToast = useAppStore((s) => s.showToast);
  const [copied, setCopied] = useState(false);

  const isLegacyTurn = views.length > 0 && views.every((v) => Boolean(getSeat(v.seatId)));
  const ordered = isLegacyTurn ? [...views].sort((a, b) => seatIndex(a.seatId) - seatIndex(b.seatId)) : views;
  const n = ordered.length;
  // Until the user picks, follow the first seat that has something to show.
  const autoIndex = Math.max(
    0,
    turn?.preferredAgentId
      ? ordered.findIndex((v) => v.seatId === turn.preferredAgentId)
      : ordered.findIndex((v) => v.text || v.phase === 'error'),
  );
  const index = Math.min(selection ? selection.index : autoIndex, Math.max(0, n - 1));
  const view = ordered[index];
  const live = view ? view.phase !== 'done' && view.phase !== 'error' : false;
  const preferred = view ? turn?.preferredAgentId === view.seatId : false;

  // Switching seats slides the new answer in from the side it came from.
  // (A shared-value animation, not a layout `entering` animation: on web those
  // leave the element absolutely positioned and collapse its parent.)
  const swap = useSharedValue(1);
  const swapDir = useSharedValue(1);
  const drag = useSharedValue(0);

  const go = (next: number) => {
    if (n <= 1) return;
    const wrapped = (next + n) % n;
    if (wrapped === index) return;
    haptic.select();
    swapDir.set(next > index ? 1 : -1);
    swap.set(0);
    swap.set(withTiming(1, { duration: 240 }));
    selectSeat(selectionKey, wrapped);
  };

  // Horizontal swipe on the answer switches seats when multiple models answered.
  const pan = usePanGesture({
    enabled: n > 1,
    activeOffsetX: [-18, 18],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      drag.set(e.translationX * 0.35);
    },
    onDeactivate: (e) => {
      'worklet';
      if (Math.abs(e.translationX) > 70 || Math.abs(e.velocityX) > 650) {
        scheduleOnRN(go, index + (e.translationX < 0 ? 1 : -1));
      }
      drag.set(withSpring(0, springs.snappy));
    },
  });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.get() + (1 - swap.get()) * 18 * swapDir.get() }],
    opacity: swap.get() * (1 - Math.min(Math.abs(drag.get()) / 160, 0.4)),
  }));

  if (!view) return null;

  const copy = async () => {
    await Clipboard.setStringAsync(view.text);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const waitingLabel =
    view.phase === 'thinking'
      ? `${view.name} is thinking`
      : view.rotations
        ? `Switching ${view.name} to a backup model`
        : `Waiting for ${view.name}`;

  return (
    <View style={styles.assistant}>
      {n > 1 ? (
        <View style={styles.chips} accessibilityRole="tablist">
          {ordered.map((v, i) => (
            <SeatChip
              key={v.seatId}
              view={v}
              active={i === index}
              onPress={() => {
                if (i !== index) go(i);
              }}
            />
          ))}
        </View>
      ) : null}

      <GestureDetector gesture={pan}>
        <Animated.View style={dragStyle}>
          <View>
            {view.phase === 'error' ? (
              <View style={[styles.error, { backgroundColor: colors.destructiveSoft }]}>
                <TriangleAlert size={16} color={colors.destructive} strokeWidth={1.75} style={styles.errorIcon} />
                <Txt variant="callout" tone="danger" style={styles.flex}>
                  {view.error || `${view.name} could not answer.`}
                </Txt>
              </View>
            ) : view.text ? (
              <MarkdownView>{live ? `${view.text} ●` : view.text}</MarkdownView>
            ) : (
              <ThinkingIndicator label={waitingLabel} />
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      {!live ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.actions}>
          {view.phase === 'done' ? (
            <>
              <ActionButton label="Copy" onPress={copy}>
                {copied ? (
                  <Check size={16} color={colors.success} strokeWidth={2} />
                ) : (
                  <Copy size={16} color={colors.mutedForeground} strokeWidth={1.75} />
                )}
              </ActionButton>
              {turn ? (
                <ActionButton label={preferred ? 'Remove preference' : 'Prefer this answer'} onPress={() => vote(turn.turnId, view.seatId)}>
                  <ThumbsUp
                    size={16}
                    color={preferred ? colors.foreground : colors.mutedForeground}
                    fill={preferred ? colors.foreground : 'transparent'}
                    strokeWidth={1.75}
                  />
                </ActionButton>
              ) : null}
              <ActionButton
                label="Share"
                onPress={() => Share.share({ message: view.text }).catch(() => showToast('Sharing is not available here.'))}
              >
                <Share2 size={16} color={colors.mutedForeground} strokeWidth={1.75} />
              </ActionButton>
            </>
          ) : null}

          {n > 1 ? (
            <View style={styles.pager}>
              <ActionButton label="Previous model" onPress={() => go(index - 1)}>
                <ChevronLeft size={16} color={colors.mutedForeground} strokeWidth={2} />
              </ActionButton>
              <Txt variant="mono" tone="secondary">
                {index + 1}/{n}
              </Txt>
              <ActionButton label="Next model" onPress={() => go(index + 1)}>
                <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={2} />
              </ActionButton>
            </View>
          ) : null}

          <View style={styles.meta}>
            <ProviderLogo company={view.rotations ? undefined : view.company} model={view.model} size={16} />
            <Txt variant="label" tone="secondary" numberOfLines={1} style={[styles.flexShrink, styles.metaText]}>
              {shortModelName(view.model)}
              {view.latencyMs ? ` · ${formatLatency(view.latencyMs)}` : ''}
              {view.rotated ? ' · backup' : ''}
              {view.tier === 'keyless' ? ' · keyless' : ''}
            </Txt>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/* Consensus ---------------------------------------------------------------- */

function Consensus({ turn }: { turn: CouncilTurn }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const synthesize = useAppStore((s) => s.synthesize);
  const busy = useAppStore((s) => !!s.synthesizing[turn.turnId]);
  const showToast = useAppStore((s) => s.showToast);
  const answered = turn.agentResponses.filter((r) => r.status === 'ok').length;
  if (answered < 2) return null;

  if (busy) return <ThinkingIndicator label="Building a consensus from all answers" />;

  if (!turn.synthesis) {
    return (
      <Pressable
        onPress={() => {
          haptic.tap();
          synthesize(turn.turnId);
        }}
        style={({ pressed }) => [styles.consensusButton, pressed && styles.actionActive]}
        accessibilityRole="button"
      >
        <Scale size={15} color={colors.foreground} strokeWidth={1.75} />
        <Txt variant="calloutMedium" style={styles.consensusLabel}>
          Build consensus
        </Txt>
        <Txt variant="caption" tone="secondary">
          merge all {answered} answers
        </Txt>
      </Pressable>
    );
  }

  const synthesis = turn.synthesis;
  return (
    <Animated.View entering={FadeInDown.springify().damping(22)} style={styles.consensus}>
      <View style={[styles.consensusHeader, { borderBottomColor: colors.border }]}>
        <View style={[styles.consensusIcon, { backgroundColor: colors.muted }]}>
          <Scale size={14} color={colors.foreground} strokeWidth={1.75} />
        </View>
        <Txt variant="calloutMedium" style={styles.flex}>
          Council consensus
        </Txt>
        <Badge label={`${answered} answers merged`} variant="secondary" />
      </View>
      <View style={styles.consensusBody}>
        <MarkdownView>{synthesis.text}</MarkdownView>
      </View>
      <View style={[styles.actions, styles.consensusActions]}>
        <ActionButton
          label="Copy consensus"
          onPress={async () => {
            await Clipboard.setStringAsync(synthesis.text);
            haptic.success();
            showToast('Consensus copied');
          }}
        >
          <Copy size={16} color={colors.mutedForeground} strokeWidth={1.75} />
        </ActionButton>
        <ActionButton label="Rebuild consensus" onPress={() => synthesize(turn.turnId)}>
          <RefreshCw size={16} color={colors.mutedForeground} strokeWidth={1.75} />
        </ActionButton>
        <Txt variant="label" tone="secondary" style={styles.consensusMeta}>
          {shortModelName(synthesis.model)} · {formatLatency(synthesis.latencyMs)}
        </Txt>
      </View>
    </Animated.View>
  );
}

/* Turns -------------------------------------------------------------------- */

export function TurnView({ turn }: { turn: CouncilTurn }) {
  const styles = useStyles();
  return (
    <View style={styles.turn}>
      <UserMessage text={turn.userPrompt} attachments={turn.attachments} />
      {turn.refinement ? <RefinedPrompt refinement={turn.refinement} /> : null}
      <AssistantMessage views={turn.agentResponses.map(fromResponse)} selectionKey={turn.turnId} turn={turn} />
      <Consensus turn={turn} />
    </View>
  );
}

export function LiveTurnView({ live }: { live: LiveTurn }) {
  const styles = useStyles();
  return (
    <View style={styles.turn}>
      <UserMessage text={live.prompt} attachments={live.attachments} />
      <LiveRefinedPrompt refinement={live.refinement} />
      {live.refinement.status === 'done' ? (
        <AssistantMessage views={Object.values(live.seats).map(fromLive)} selectionKey="live" />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  turn: { gap: 16, marginBottom: 32 },
  userRow: { alignItems: 'flex-end' },
  userAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    maxWidth: '85%',
    marginBottom: 8,
  },
  userThumbWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.muted,
  },
  userThumb: { width: 64, height: 64 },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    backgroundColor: c.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: 240,
  },
  userChipText: { flexShrink: 1, gap: 1 },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: c.muted,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistant: { gap: 12 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chipWrap: { maxWidth: '100%' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: { fontSize: 12.5, flexShrink: 1 },
  error: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md },
  errorIcon: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: -6 },
  action: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  actionActive: { backgroundColor: c.muted },
  pager: { flexDirection: 'row', alignItems: 'center', marginLeft: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8, flexShrink: 1 },
  metaText: { fontFamily: fonts.regular },
  consensusButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    height: 32,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.input,
    backgroundColor: c.card,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.25)',
  },
  consensusLabel: { fontSize: 13 },
  consensus: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    overflow: 'hidden',
  },
  consensusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  consensusIcon: { width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  consensusBody: { paddingHorizontal: 16, paddingTop: 14 },
  consensusActions: { marginLeft: 0, paddingHorizontal: 10, paddingBottom: 8 },
  consensusMeta: { marginLeft: 6, fontFamily: fonts.regular },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
}));
