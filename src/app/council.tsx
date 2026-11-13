import { ChevronDown, Gauge, RefreshCw, Snowflake } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useDerivedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProviderLogo } from '@/components/brand';
import { Button, IconButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Card, Divider, ScreenHeader, SectionHeader } from '@/components/ui/layout';
import { Headline, MonoLabel, Txt } from '@/components/ui/text';
import { api } from '@/lib/api';
import { formatLatency, pad2, relativeTime } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { getSeat, shortModelName } from '@/shared/council';
import type { CouncilStatus, SeatModelStatus } from '@/shared/types';
import { makeStyles, radius, springs, useTheme } from '@/theme';

function QuotaCard({ status }: { status: CouncilStatus }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { remaining, limit, configuredKeys, healthyKeys } = status.quota;
  const ratio = remaining !== null && limit ? Math.min(1, remaining / limit) : 0;
  const fill = useDerivedValue(() => withTiming(ratio, { duration: 700 }), [ratio]);
  const barStyle = useAnimatedStyle(() => ({ width: `${fill.get() * 100}%` }));
  const tone = remaining === 0 ? colors.danger : ratio < 0.2 ? colors.warning : colors.accent;

  return (
    <Card style={styles.gap}>
      <MonoLabel>Free requests left today</MonoLabel>
      <View style={styles.quotaRow}>
        <Txt variant="display">{remaining ?? '—'}</Txt>
        {limit ? (
          <Txt variant="headline" tone="tertiary">
            / {limit}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
        <Animated.View style={[styles.fill, { backgroundColor: tone }, barStyle]} />
      </View>
      <Txt variant="caption" tone="secondary">
        {configuredKeys === 0
          ? 'No OpenRouter key is configured — every seat answers through the keyless fallback tier.'
          : `${healthyKeys} of ${configuredKeys} OpenRouter ${configuredKeys === 1 ? 'key' : 'keys'} healthy · quotas reset at 00:00 UTC. When all are spent, seats fall back to the keyless tier.`}
      </Txt>
    </Card>
  );
}

function SeatStatusCard({ seat, index }: { seat: SeatModelStatus; index: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const def = getSeat(seat.seatId);
  const [open, setOpen] = useState(false);
  const rotation = useDerivedValue(() => withSpring(open ? 180 : 0, springs.snappy), [open]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  return (
    <Animated.View entering={FadeInDown.delay(80 + index * 70).springify().damping(20)}>
      <Card padded={false}>
        <View style={styles.seatHeader}>
          <Txt variant="mono" tone="tertiary">
            {pad2(index + 1)}
          </Txt>
          <ProviderLogo provider={def?.providerKey} size={36} />
          <View style={styles.flex}>
            <Txt variant="bodyMedium">{seat.agentName}</Txt>
            <Txt variant="caption" tone="tertiary">
              {def?.persona} · {seat.provider}
            </Txt>
          </View>
          <View
            style={[
              styles.pill,
              { backgroundColor: seat.isAvailable ? colors.successSoft : colors.warningSoft },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: seat.isAvailable ? colors.success : colors.warning }]} />
            <Txt variant="label" tone={seat.isAvailable ? 'success' : 'warning'}>
              {seat.isAvailable ? 'READY' : 'COOLING'}
            </Txt>
          </View>
        </View>
        <Divider />
        <View style={styles.stats}>
          <Stat label="Primary" value={shortModelName(seat.primaryModel)} mono />
          <Stat label="Latency" value={formatLatency(seat.latencyMs)} />
          <Stat label="Verified" value={seat.verifiedAt ? relativeTime(seat.verifiedAt) : 'never'} />
        </View>
        <Divider />
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.expand} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Txt variant="caption" tone="secondary" style={styles.flex}>
            {seat.fallbackModels.length} fallback models
            {seat.coolingModels.length ? ` · ${seat.coolingModels.length} cooling down` : ''}
          </Txt>
          <Animated.View style={chevron}>
            <ChevronDown size={15} color={colors.textTertiary} />
          </Animated.View>
        </Pressable>
        {open ? (
          <Animated.View entering={FadeIn.duration(180)} style={styles.fallbacks}>
            {seat.fallbackModels.map((model, i) => {
              const cooling = seat.coolingModels.includes(model);
              return (
                <View key={model} style={styles.fallback}>
                  <Txt variant="mono" tone="tertiary" style={styles.fallbackIndex}>
                    {pad2(i + 2)}
                  </Txt>
                  <Txt variant="mono" tone={cooling ? 'tertiary' : 'secondary'} style={styles.flex} numberOfLines={1}>
                    {model}
                  </Txt>
                  {cooling ? <Snowflake size={12} color={colors.warning} /> : null}
                </View>
              );
            })}
          </Animated.View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <MonoLabel>{label}</MonoLabel>
      <Txt variant={mono ? 'mono' : 'calloutMedium'} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

export default function CouncilScreen() {
  const styles = useStyles();
  const showToast = useAppStore((s) => s.showToast);
  const [status, setStatus] = useState<CouncilStatus | null>(null);
  const [busy, setBusy] = useState<'refresh' | 'verify' | 'probe' | null>('refresh');

  const load = useCallback(
    async (mode: 'refresh' | 'verify' | 'probe') => {
      setBusy(mode);
      try {
        const next = mode === 'refresh' ? await api.councilStatus() : await api.verifyCouncil(mode);
        setStatus(next);
        if (mode !== 'refresh') {
          haptic.success();
          showToast(mode === 'probe' ? 'Latency measured' : 'Catalog re-verified', 'success');
        }
      } catch (err) {
        showToast((err as Error).message || 'Could not load council status.', 'danger');
      } finally {
        setBusy(null);
      }
    },
    [showToast],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .councilStatus()
      .then((next) => !cancelled && setStatus(next))
      .catch((err) => showToast((err as Error).message || 'Could not load council status.', 'danger'))
      .finally(() => !cancelled && setBusy(null));
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Council status"
        trailing={<IconButton icon={RefreshCw} label="Refresh" onPress={() => load('refresh')} disabled={!!busy} />}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={busy === 'refresh' && !!status} onRefresh={() => load('refresh')} />}
      >
        <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.hero}>
          <Headline variant="title" muted="Free models only." strong="Verified against the live catalog." />
          <Txt tone="secondary">
            Each seat keeps a ranked pool of zero-cost models. If one is rate-limited, the seat fails over to the next —
            then to another key, then to a keyless tier.
          </Txt>
        </Animated.View>

        {!status ? (
          <View style={styles.gap}>
            <Skeleton height={150} style={{ borderRadius: radius.md }} />
            <Skeleton height={180} style={{ borderRadius: radius.md }} />
            <Skeleton height={180} style={{ borderRadius: radius.md }} />
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(40).springify().damping(20)}>
              <SectionHeader index="01" title="Quota" trailing={<MonoLabel>{relativeTime(status.checkedAt)}</MonoLabel>} />
              <QuotaCard status={status} />
            </Animated.View>

            <View>
              <SectionHeader
                index="02"
                title="Seats"
                trailing={status.catalogSize ? <MonoLabel>{status.catalogSize} models in catalog</MonoLabel> : null}
              />
              <View style={styles.gap}>
                {status.seats.map((seat, i) => (
                  <SeatStatusCard key={seat.seatId} seat={seat} index={i} />
                ))}
              </View>
            </View>

            <View>
              <SectionHeader index="03" title="Diagnostics" />
              <Card style={styles.gap}>
                <Button label="Re-verify catalog" variant="secondary" icon={RefreshCw} fullWidth loading={busy === 'verify'} disabled={!!busy} onPress={() => load('verify')} />
                <Txt variant="caption" tone="tertiary">
                  Free. Re-checks every pool against OpenRouter’s live model list and key quotas.
                </Txt>
                <Divider />
                <Button label="Measure latency" variant="secondary" icon={Gauge} fullWidth loading={busy === 'probe'} disabled={!!busy} onPress={() => load('probe')} />
                <Txt variant="caption" tone="tertiary">
                  Sends one tiny request to each seat’s primary model — uses up to 3 of today’s free requests.
                </Txt>
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 28, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hero: { gap: 12 },
  gap: { gap: 12 },
  quotaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  seatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 9, borderRadius: radius.pill },
  dot: { width: 6, height: 6, borderRadius: 3 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 6, padding: 14, borderRightWidth: 1, borderColor: c.border },
  expand: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  fallbacks: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fallbackIndex: { width: 20 },
  flex: { flex: 1 },
}));
