import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Repeat, Share, ThumbsUp, TriangleAlert, Wifi } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Share as RNShare, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { ProviderLogo } from '@/components/brand';
import { formatLatency } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { getSeat, shortModelName } from '@/shared/council';
import { makeStyles, radius, useTheme } from '@/theme';
import { PulseDot, Skeleton } from '../ui/feedback';
import { MonoLabel, Txt } from '../ui/text';
import { DirectiveInspector } from './directive-inspector';
import { MarkdownView } from './markdown';
import type { SeatView } from './seat-view';

function StatusChip({ view }: { view: SeatView }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const accent = colors.seats[view.seatId] ?? colors.accent;

  if (view.phase === 'done') {
    return (
      <View style={styles.chip}>
        <Txt variant="mono" tone="tertiary">
          {formatLatency(view.latencyMs)}
        </Txt>
      </View>
    );
  }
  if (view.phase === 'error') {
    return (
      <View style={[styles.chip, { backgroundColor: colors.dangerSoft, borderColor: 'transparent' }]}>
        <Txt variant="label" tone="danger">
          FAILED
        </Txt>
      </View>
    );
  }
  const label = view.phase === 'thinking' ? 'THINKING' : view.phase === 'streaming' ? 'WRITING' : view.rotations ? 'ROTATING' : 'QUEUED';
  return (
    <View style={styles.chip}>
      <PulseDot color={accent} size={6} />
      <Txt variant="label" tone="secondary">
        {label}
      </Txt>
    </View>
  );
}

export function SeatCard({
  view,
  preferred = false,
  onPrefer,
}: {
  view: SeatView;
  preferred?: boolean;
  onPrefer?: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const seat = getSeat(view.seatId);
  const [copied, setCopied] = useState(false);
  const accent = colors.seats[view.seatId] ?? colors.accent;
  const live = view.phase !== 'done' && view.phase !== 'error';

  const copy = async () => {
    await Clipboard.setStringAsync(view.text);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = () => {
    RNShare.share({ message: `${seat?.name ?? 'Council'}:\n\n${view.text}` }).catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
      <View style={styles.header}>
        <ProviderLogo model={view.model} provider={view.rotated || view.rotations ? undefined : seat?.providerKey} size={34} />
        <View style={styles.headerText}>
          <Txt variant="bodyMedium" numberOfLines={1}>
            {seat?.name ?? view.seatId}
          </Txt>
          <Txt variant="mono" tone="tertiary" numberOfLines={1}>
            {seat?.persona ? `${seat.persona} · ` : ''}
            {shortModelName(view.model)}
          </Txt>
        </View>
        <StatusChip view={view} />
      </View>

      {view.rotated || view.tier === 'keyless' || (live && view.rotations > 0) ? (
        <View style={styles.badges}>
          {view.rotated || (live && view.rotations > 0) ? (
            <View style={styles.badge}>
              <Repeat size={11} color={colors.textSecondary} strokeWidth={2} />
              <Txt variant="label" tone="secondary">
                FAILOVER
              </Txt>
            </View>
          ) : null}
          {view.tier === 'keyless' ? (
            <View style={styles.badge}>
              <Wifi size={11} color={colors.textSecondary} strokeWidth={2} />
              <Txt variant="label" tone="secondary">
                KEYLESS TIER
              </Txt>
            </View>
          ) : null}
        </View>
      ) : null}

      {view.byName && view.directive ? <DirectiveInspector byName={view.byName} directive={view.directive} /> : null}

      <View style={styles.body}>
        {view.phase === 'error' ? (
          <View style={[styles.error, { backgroundColor: colors.dangerSoft }]}>
            <TriangleAlert size={16} color={colors.danger} strokeWidth={1.8} />
            <Txt variant="callout" tone="danger" style={styles.flex}>
              {view.error || 'This seat could not answer.'}
            </Txt>
          </View>
        ) : view.text ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <MarkdownView>{live ? `${view.text} ▍` : view.text}</MarkdownView>
          </Animated.View>
        ) : (
          <View style={styles.skeletons}>
            <MonoLabel>{view.phase === 'thinking' ? 'Reasoning before it writes…' : 'Waiting for the first token…'}</MonoLabel>
            <Skeleton width="92%" />
            <Skeleton width="76%" />
            <Skeleton width="84%" />
          </View>
        )}
      </View>

      {view.phase === 'done' ? (
        <View style={styles.footer}>
          <FooterButton onPress={copy} label={copied ? 'Copied' : 'Copy'}>
            {copied ? (
              <Check size={15} color={colors.success} strokeWidth={2} />
            ) : (
              <Copy size={15} color={colors.textSecondary} strokeWidth={1.7} />
            )}
          </FooterButton>
          <FooterButton onPress={share} label="Share">
            <Share size={15} color={colors.textSecondary} strokeWidth={1.7} />
          </FooterButton>
          <View style={styles.flex} />
          {onPrefer ? (
            <Pressable
              onPress={() => {
                haptic.tap();
                onPrefer();
              }}
              style={[styles.prefer, preferred && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityState={{ selected: preferred }}
              accessibilityLabel={preferred ? 'Remove preference' : 'Prefer this answer'}
            >
              {preferred ? (
                <Animated.View entering={ZoomIn.springify().damping(12)}>
                  <ThumbsUp size={14} color={colors.onPrimary} strokeWidth={2} fill={colors.onPrimary} />
                </Animated.View>
              ) : (
                <ThumbsUp size={14} color={colors.textSecondary} strokeWidth={1.8} />
              )}
              <Txt variant="caption" color={preferred ? colors.onPrimary : colors.textSecondary}>
                {preferred ? 'Preferred' : 'Prefer'}
              </Txt>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FooterButton({ onPress, label, children }: { onPress: () => void; label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.footerButton} accessibilityRole="button" accessibilityLabel={label}>
      {children}
      <Txt variant="caption" tone="secondary">
        {label}
      </Txt>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: { paddingHorizontal: 16, paddingTop: 16 },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerText: { flex: 1, gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
  badges: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceMuted,
  },
  body: { paddingTop: 14, paddingBottom: 6, minHeight: 90 },
  skeletons: { gap: 10, paddingTop: 2 },
  error: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 10 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderTopWidth: 1,
    borderColor: c.border,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prefer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  flex: { flex: 1 },
}));
