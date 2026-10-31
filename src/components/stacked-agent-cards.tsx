import * as Clipboard from 'expo-clipboard';
import { ArrowRightLeft, Check, ChevronLeft, ChevronRight, Copy, Layers } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';

import { Colors, Radius } from '@/constants/colors';
import { ALL_MODELS_VIEW, COUNCIL_META, getCouncilIndex } from '@/constants/council';
import { useAppStore } from '@/store';
import type { AgentResponseItem } from '@/types';
import { getModelProvider, ModelLogo, PROVIDER_LABEL } from './model-logo';
import { PromptInspector } from './prompt-inspector';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Horizontal drag distance (px) after which a swipe commits. */
const SWIPE_THRESHOLD = 80;
/** Vertical peek distance between stacked cards. */
const PEEK_OFFSET = 10;
/** Scale of each successive card behind the top one. */
const PEEK_SCALE_STEP = 0.05;

function sortResponses(responses: AgentResponseItem[]): AgentResponseItem[] {
  const order = (r: AgentResponseItem) => {
    const i = getCouncilIndex(r.agentId);
    return i >= 0 ? i : COUNCIL_META.length;
  };
  return [...responses].sort((a, b) => order(a) - order(b));
}

const markdownStyles = {
  body: { color: Colors.textPrimary, fontSize: 15, lineHeight: 23 },
  paragraph: { marginTop: 0, marginBottom: 10 },
  heading1: { color: Colors.textPrimary, fontSize: 22, fontWeight: '700' as const, marginVertical: 8 },
  heading2: { color: Colors.textPrimary, fontSize: 19, fontWeight: '700' as const, marginVertical: 8 },
  heading3: { color: Colors.textPrimary, fontSize: 17, fontWeight: '600' as const, marginVertical: 6 },
  strong: { color: Colors.textPrimary, fontWeight: '700' as const },
  em: { fontStyle: 'italic' as const },
  link: { color: Colors.primaryLight },
  bullet_list: { marginBottom: 6 },
  ordered_list: { marginBottom: 6 },
  list_item: { marginVertical: 2 },
  blockquote: {
    backgroundColor: Colors.background,
    borderLeftColor: Colors.primary,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 2,
    marginVertical: 8,
  },
  code_inline: {
    backgroundColor: Colors.background,
    color: Colors.primaryLight,
    fontFamily: MONO,
    fontSize: 13,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  code_block: {
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontFamily: MONO,
    fontSize: 13,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    marginVertical: 8,
  },
  fence: {
    backgroundColor: Colors.background,
    color: Colors.textPrimary,
    fontFamily: MONO,
    fontSize: 13,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    marginVertical: 8,
  },
  hr: { backgroundColor: Colors.border, height: 1, marginVertical: 12 },
  table: { borderColor: Colors.border, borderWidth: 1, borderRadius: Radius.sm, marginVertical: 8 },
  th: { padding: 6, color: Colors.textPrimary, fontWeight: '700' as const },
  td: { padding: 6, color: Colors.textSecondary },
  tr: { borderColor: Colors.border, borderBottomWidth: 1 },
};

/* ------------------------------------------------------------------ */
/* Single card content                                                  */
/* ------------------------------------------------------------------ */

interface DeckCardProps {
  turnId: string;
  agentId: string;
}

function DeckCard({ turnId, agentId }: DeckCardProps) {
  const response = useAppStore((s) =>
    s.turns.find((t) => t.turnId === turnId)?.agentResponses.find((r) => r.agentId === agentId),
  );

  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  if (!response) return null;

  const peerName = response.optimizedByAgentName ?? 'Peer Model';
  const provider = getModelProvider(response.agentId);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(response.answer);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.logoBox}>
          <ModelLogo modelId={response.agentId} size={24} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.modelName} numberOfLines={1}>
            {response.agentName}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.providerBadge}>
              <Text style={styles.providerBadgeText}>{PROVIDER_LABEL[provider]}</Text>
            </View>
            <ArrowRightLeft size={12} color={Colors.textMuted} />
            <Text style={styles.optimizedText} numberOfLines={1}>
              Optimized by: {peerName}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={handleCopy}
          style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}
          accessibilityLabel="Copy answer"
        >
          {copied ? (
            <Check size={14} color={Colors.primaryLight} />
          ) : (
            <Copy size={14} color={Colors.textSecondary} />
          )}
          <Text style={[styles.copyText, copied && styles.copyTextDone]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <PromptInspector turnId={turnId} agentId={agentId} />

      <View style={styles.answer}>
        <Markdown style={markdownStyles}>{response.answer}</Markdown>
      </View>
    </View>
  );
}

/**
 * Holds mutable swipe state so the PanResponder (created once) always sees current values
 * without re-creating handlers or reading refs during render.
 */
class DeckController {
  private busy = false;
  private prevTopId: string | undefined = undefined;
  private count = 0;
  private topIndex = 0;
  private ids: string[] = [];
  private width = 0;
  private onCommit: (agentId: string) => void = () => {};

  constructor(private readonly x: Animated.Value) {}

  sync(next: {
    count: number;
    topIndex: number;
    ids: string[];
    width: number;
    onCommit: (agentId: string) => void;
  }) {
    this.count = next.count;
    this.topIndex = next.topIndex;
    this.ids = next.ids;
    this.width = next.width;
    this.onCommit = next.onCommit;
  }

  /** Records the current top card; returns true if it changed since the last call. */
  markTop(topId: string | undefined) {
    this.busy = false;
    const changed = this.prevTopId !== undefined && this.prevTopId !== topId;
    this.prevTopId = topId;
    return changed;
  }

  canSwipe() {
    return this.count > 1 && !this.busy;
  }

  /** Fly the top card off-screen (direction 1 → right, -1 → left) and promote another card. */
  goTo(step: number, direction: 1 | -1) {
    if (!this.canSwipe()) return;
    this.busy = true;
    const targetId = this.ids[(this.topIndex + step + this.count) % this.count];
    Animated.timing(this.x, {
      toValue: direction * this.width * 1.2,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        this.onCommit(targetId);
      } else {
        this.busy = false;
      }
    });
  }

  springBack() {
    Animated.spring(this.x, {
      toValue: 0,
      friction: 7,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }
}

/* ------------------------------------------------------------------ */
/* Card stack                                                           */
/* ------------------------------------------------------------------ */

interface StackedAgentCardsProps {
  turnId: string;
}

export function StackedAgentCards({ turnId }: StackedAgentCardsProps) {
  const agentResponses = useAppStore((s) => s.turns.find((t) => t.turnId === turnId)?.agentResponses);
  const activeView = useAppStore((s) => s.activeViews[turnId] ?? ALL_MODELS_VIEW);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const { width } = useWindowDimensions();

  const ids = useMemo(() => sortResponses(agentResponses ?? []).map((r) => r.agentId), [agentResponses]);
  const count = ids.length;
  const foundIndex = ids.indexOf(activeView);
  const topIndex = foundIndex >= 0 ? foundIndex : 0;
  const topId = ids[topIndex];

  const [x] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(1));
  const [topHeight, setTopHeight] = useState(0);

  // Imperative controller shared with the (created-once) PanResponder callbacks.
  const [ctl] = useState(() => new DeckController(x));

  useEffect(() => {
    ctl.sync({ count, topIndex, ids, width, onCommit: (id) => setActiveView(turnId, id) });
  }, [ctl, count, topIndex, ids, width, setActiveView, turnId]);

  // When a new card takes the top, reset drag state and settle it into place.
  useEffect(() => {
    x.setValue(0);
    if (ctl.markTop(topId)) {
      enter.setValue(0.95);
      Animated.spring(enter, {
        toValue: 1,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }).start();
    }
  }, [ctl, topId, x, enter]);

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        ctl.canSwipe() &&
        Math.abs(g.dx) > 12 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        if (ctl.canSwipe()) x.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (!ctl.canSwipe()) return;
        const committed =
          Math.abs(g.dx) > SWIPE_THRESHOLD || (Math.abs(g.vx) > 0.6 && Math.abs(g.dx) > 30);
        if (committed) {
          ctl.goTo(1, g.dx >= 0 ? 1 : -1);
        } else {
          ctl.springBack();
        }
      },
      onPanResponderTerminate: () => {
        if (ctl.canSwipe()) ctl.springBack();
      },
    }),
  );

  if (count === 0 || !topId) return null;

  const isStack = count > 1;
  const shellCount = Math.min(count - 1, 2);

  // 0 → resting, 1 → dragged far enough for the next card to be on top.
  const progress = x.interpolate({
    inputRange: [-120, 0, 120],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });
  const rotate = x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ['-8deg', '0deg', '8deg'],
  });
  const opacity = x.interpolate({
    inputRange: [-width * 1.1, -width * 0.5, 0, width * 0.5, width * 1.1],
    outputRange: [0, 0.9, 1, 0.9, 0],
    extrapolate: 'clamp',
  });

  const shellStyle = (level: 1 | 2) => {
    const baseScale = 1 - PEEK_SCALE_STEP * level;
    const nextScale = 1 - PEEK_SCALE_STEP * (level - 1);
    // With a top transform-origin, a card of height H scaled by s ends H*(1-s) short of its
    // original bottom; translate it down so exactly PEEK_OFFSET * level peeks below the top card.
    const baseY = PEEK_OFFSET * level + topHeight * PEEK_SCALE_STEP * level;
    const nextY = PEEK_OFFSET * (level - 1) + topHeight * PEEK_SCALE_STEP * (level - 1);
    return {
      height: topHeight,
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [level === 2 ? 0.75 : 1, 1],
      }),
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [baseY, nextY] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [baseScale, nextScale] }) },
      ],
    };
  };

  const goPrev = () => ctl.goTo(-1, 1);
  const goNext = () => ctl.goTo(1, -1);

  return (
    <View style={styles.stack}>
      {isStack ? (
        <View style={styles.stackHeader}>
          <View style={styles.stackTitleRow}>
            <Layers size={14} color={Colors.primaryLight} />
            <Text style={styles.stackTitle}>
              Card {topIndex + 1} of {count}
            </Text>
            <View style={styles.pills}>
              {ids.map((id, i) => (
                <Pressable
                  key={id}
                  hitSlop={8}
                  onPress={() => setActiveView(turnId, id)}
                  accessibilityLabel={`Show card ${i + 1}`}
                  style={[styles.pill, i === topIndex && styles.pillActive]}
                />
              ))}
            </View>
          </View>
          <View style={styles.navRow}>
            <Pressable
              onPress={goPrev}
              hitSlop={8}
              accessibilityLabel="Previous card"
              style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
            >
              <ChevronLeft size={16} color={Colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={goNext}
              hitSlop={8}
              accessibilityLabel="Next card"
              style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}
            >
              <Text style={styles.nextText}>Swipe or tap next</Text>
              <ChevronRight size={14} color={Colors.primaryLight} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.deck, { paddingBottom: shellCount * PEEK_OFFSET }]}>
        {/* Cards peeking out from behind (deepest first so nearer ones paint on top). */}
        {shellCount >= 2 && topHeight > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.shell, shellStyle(2)]} />
        ) : null}
        {shellCount >= 1 && topHeight > 0 ? (
          <Animated.View pointerEvents="none" style={[styles.shell, shellStyle(1)]} />
        ) : null}

        <Animated.View
          onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}
          style={[
            styles.topCard,
            {
              opacity,
              transform: [{ translateX: x }, { rotate }, { scale: enter }],
            },
          ]}
          {...(isStack ? panResponder.panHandlers : {})}
        >
          <DeckCard key={topId} turnId={turnId} agentId={topId} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },

  stackHeader: { gap: 8 },
  stackTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stackTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 4 },
  pill: {
    width: 14,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceElevated,
  },
  pillActive: { width: 26, backgroundColor: Colors.primary },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.accent,
  },
  nextText: { color: Colors.accentForeground, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.75 },

  deck: { position: 'relative' },
  shell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    transformOrigin: 'top center',
  },
  topCard: {},

  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.xl,
    padding: 14,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 3 },
  modelName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  providerBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  providerBadgeText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  optimizedText: { color: Colors.textMuted, fontSize: 12, flexShrink: 1 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHigh,
  },
  copyText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  copyTextDone: { color: Colors.primaryLight },

  answer: { paddingTop: 2 },
});
