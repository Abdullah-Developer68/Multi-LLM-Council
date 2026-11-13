import * as Clipboard from 'expo-clipboard';
import { Copy, RefreshCw, Scale, Square } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { formatLatency, pad2 } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import type { LiveTurn } from '@/store/types';
import { shortModelName } from '@/shared/council';
import type { CouncilTurn } from '@/shared/types';
import { makeStyles, radius, useTheme } from '@/theme';
import { Button } from '../ui/button';
import { ProgressSegments, Skeleton } from '../ui/feedback';
import { MonoLabel, Txt } from '../ui/text';
import { CouncilView } from './council-view';
import { MarkdownView } from './markdown';
import { fromLive, fromResponse } from './seat-view';

function PromptBlock({ index, prompt, meta }: { index: number; prompt: string; meta?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.prompt}>
      <View style={styles.promptHeader}>
        <MonoLabel>[ {pad2(index)} ] You asked</MonoLabel>
        {meta ? <MonoLabel>{meta}</MonoLabel> : null}
      </View>
      <Txt variant="headline" selectable>
        {prompt}
      </Txt>
    </View>
  );
}

function ConsensusPanel({ turn }: { turn: CouncilTurn }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const synthesis = turn.synthesis;
  if (!synthesis) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.consensus}>
      <View style={styles.consensusHeader}>
        <Scale size={16} color={colors.text} strokeWidth={1.7} />
        <Txt variant="bodyMedium" style={styles.flex}>
          Council consensus
        </Txt>
        <Pressable
          hitSlop={8}
          onPress={async () => {
            await Clipboard.setStringAsync(synthesis.text);
            haptic.success();
            showToast('Consensus copied');
          }}
          accessibilityLabel="Copy consensus"
        >
          <Copy size={15} color={colors.textSecondary} strokeWidth={1.7} />
        </Pressable>
      </View>
      <MonoLabel style={styles.consensusMeta}>
        Chaired by {shortModelName(synthesis.model)} · {formatLatency(synthesis.latencyMs)}
      </MonoLabel>
      <MarkdownView>{synthesis.text}</MarkdownView>
    </Animated.View>
  );
}

function ConsensusLoading() {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.consensus}>
      <MonoLabel>The chair is reconciling the answers…</MonoLabel>
      <View style={styles.loadingLines}>
        <Skeleton width="60%" height={16} />
        <Skeleton width="94%" />
        <Skeleton width="88%" />
        <Skeleton width="72%" />
      </View>
    </Animated.View>
  );
}

/** A finished council turn. */
export function TurnView({ turn, index }: { turn: CouncilTurn; index: number }) {
  const styles = useStyles();
  const vote = useAppStore((s) => s.vote);
  const synthesize = useAppStore((s) => s.synthesize);
  const synthesizing = useAppStore((s) => !!s.synthesizing[turn.turnId]);
  const answered = turn.agentResponses.filter((r) => r.status === 'ok').length;
  const meta = [turn.elapsedMs ? formatLatency(turn.elapsedMs) : null, turn.contextTurns ? `+${turn.contextTurns} ctx` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={FadeInDown.springify().damping(22)} style={styles.turn}>
      <PromptBlock index={index} prompt={turn.userPrompt} meta={meta || undefined} />
      <CouncilView
        views={turn.agentResponses.map(fromResponse)}
        preferredSeatId={turn.preferredAgentId}
        onPrefer={(seatId) => vote(turn.turnId, seatId)}
      />
      <View style={styles.actions}>
        <Txt variant="caption" tone="tertiary" style={styles.flex}>
          {answered}/{turn.agentResponses.length} seats answered · swipe to compare
        </Txt>
        {answered >= 2 ? (
          <Button
            label={turn.synthesis ? 'Rebuild consensus' : 'Build consensus'}
            icon={turn.synthesis ? RefreshCw : Scale}
            variant={turn.synthesis ? 'secondary' : 'primary'}
            size="sm"
            loading={synthesizing}
            onPress={() => synthesize(turn.turnId)}
          />
        ) : null}
      </View>
      {synthesizing ? <ConsensusLoading /> : <ConsensusPanel turn={turn} />}
    </Animated.View>
  );
}

function useElapsed(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - startedAt);
}

/** The turn currently being answered, with live per-seat streaming. */
export function LiveTurnView({ live, index }: { live: LiveTurn; index: number }) {
  const styles = useStyles();
  const cancel = useAppStore((s) => s.cancel);
  const elapsed = useElapsed(live.startedAt);
  const views = Object.values(live.seats).map(fromLive);
  const settled = views.filter((v) => v.phase === 'done' || v.phase === 'error').length;

  return (
    <Animated.View entering={FadeInDown.springify().damping(22)} style={styles.turn}>
      <PromptBlock index={index} prompt={live.prompt} meta={formatLatency(elapsed)} />
      <View style={styles.progress}>
        <View style={styles.progressHeader}>
          <MonoLabel tone="secondary">
            {settled === views.length ? 'Saving the turn…' : `Council in session · ${settled}/${views.length}`}
          </MonoLabel>
          <Pressable onPress={cancel} hitSlop={8} style={styles.stop} accessibilityLabel="Stop generating">
            <Square size={10} color={styles.stopIcon.color} fill={styles.stopIcon.color} />
            <MonoLabel tone="secondary">Stop</MonoLabel>
          </Pressable>
        </View>
        <ProgressSegments total={views.length} done={settled} />
      </View>
      <CouncilView views={views} />
    </Animated.View>
  );
}

const useStyles = makeStyles((c) => ({
  turn: { gap: 16, paddingBottom: 28, marginBottom: 28, borderBottomWidth: 1, borderColor: c.border },
  prompt: { gap: 8 },
  promptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progress: { gap: 10 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  stopIcon: { color: c.textSecondary },
  consensus: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: 16,
  },
  consensusHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consensusMeta: { marginTop: 6, marginBottom: 12 },
  loadingLines: { gap: 10, marginTop: 14 },
  flex: { flex: 1 },
}));
