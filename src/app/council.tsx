import { ChevronDown, Gauge, RefreshCw, Snowflake } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { ProviderLogo } from '@/components/brand';
import { AppHeader, BackButton, Screen } from '@/components/shell';
import { Button, IconButton } from '@/components/ui/button';
import { Progress, Skeleton } from '@/components/ui/feedback';
import { Badge, Card, CardHeader, Divider, SectionHeader } from '@/components/ui/layout';
import { Headline, Label, Txt } from '@/components/ui/text';
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
  const tone = remaining === 0 ? colors.destructive : ratio < 0.2 ? colors.warning : colors.foreground;

  return (
    <Card style={styles.gap}>
      <View style={styles.quotaTop}>
        <View style={styles.flex}>
          <Txt variant="headline">Free requests left today</Txt>
          <Txt variant="callout" tone="secondary">
            Quotas reset at 00:00 UTC.
          </Txt>
        </View>
        <Txt variant="mono" style={styles.quotaCount}>
          {remaining ?? '—'}
          {limit ? ` / ${limit}` : ''}
        </Txt>
      </View>
      <Progress value={ratio} color={tone} />
      <Txt variant="caption" tone="secondary">
        {configuredKeys === 0
          ? 'No OpenRouter key is configured — every seat answers through the keyless fallback tier.'
          : `${healthyKeys} of ${configuredKeys} OpenRouter ${configuredKeys === 1 ? 'key' : 'keys'} healthy. When all are spent, seats fall back to the keyless tier.`}
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
          <ProviderLogo provider={def?.providerKey} size={36} />
          <View style={styles.flex}>
            <View style={styles.seatName}>
              <Txt variant="mono" tone="tertiary">
                {pad2(index + 1)}
              </Txt>
              <Txt variant="bodyMedium">{seat.agentName}</Txt>
            </View>
            <Txt variant="caption" tone="secondary">
              {def?.persona} · {seat.provider}
            </Txt>
          </View>
          <Badge
            label={seat.isAvailable ? 'Ready' : 'Cooling'}
            variant={seat.isAvailable ? 'success' : 'warning'}
            dot={seat.isAvailable ? colors.success : colors.warning}
          />
        </View>
        <Divider />
        <View style={styles.stats}>
          <Stat label="Primary" value={shortModelName(seat.primaryModel)} mono />
          <Stat label="Latency" value={formatLatency(seat.latencyMs)} />
          <Stat label="Verified" value={seat.verifiedAt ? relativeTime(seat.verifiedAt) : 'never'} />
        </View>
        <Divider />
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.expand} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Txt variant="callout" tone="secondary" style={styles.flex}>
            {seat.fallbackModels.length} fallback models
            {seat.coolingModels.length ? ` · ${seat.coolingModels.length} cooling down` : ''}
          </Txt>
          <Animated.View style={chevron}>
            <ChevronDown size={15} color={colors.mutedForeground} strokeWidth={1.75} />
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
      <Label>{label}</Label>
      <Txt variant={mono ? 'mono' : 'calloutMedium'} numberOfLines={1}>
        {value}
      </Txt>
    </View>
  );
}

export default function CouncilScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
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
    <Screen
      header={
        <AppHeader
          title="Council status"
          leading={<BackButton />}
          trailing={
            <IconButton
              icon={RefreshCw}
              label="Refresh"
              size={40}
              onPress={() => load('refresh')}
              disabled={!!busy}
              color={colors.foreground}
            />
          }
        />
      }
    >
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
            <Skeleton height={130} style={{ borderRadius: radius.lg }} />
            <Skeleton height={180} style={{ borderRadius: radius.lg }} />
            <Skeleton height={180} style={{ borderRadius: radius.lg }} />
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(40).springify().damping(20)}>
              <SectionHeader title="Quota" trailing={<Label>Checked {relativeTime(status.checkedAt)}</Label>} />
              <QuotaCard status={status} />
            </Animated.View>

            <View>
              <SectionHeader
                title="Seats"
                trailing={status.catalogSize ? <Label>{status.catalogSize} models in catalog</Label> : null}
              />
              <View style={styles.gap}>
                {status.seats.map((seat, i) => (
                  <SeatStatusCard key={seat.seatId} seat={seat} index={i} />
                ))}
              </View>
            </View>

            <Card style={styles.diagnostics}>
              <CardHeader title="Diagnostics" description="Check the catalog and seat health on demand." />
              <View style={styles.diagRow}>
                <View style={styles.flex}>
                  <Txt variant="calloutMedium">Re-verify catalog</Txt>
                  <Txt variant="caption" tone="secondary">
                    Free. Re-checks every pool against OpenRouter’s live model list and key quotas.
                  </Txt>
                </View>
                <Button
                  label="Re-verify"
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  loading={busy === 'verify'}
                  disabled={!!busy}
                  onPress={() => load('verify')}
                />
              </View>
              <Divider />
              <View style={styles.diagRow}>
                <View style={styles.flex}>
                  <Txt variant="calloutMedium">Measure latency</Txt>
                  <Txt variant="caption" tone="secondary">
                    Sends one tiny request to each seat’s primary model — uses up to 3 of today’s free requests.
                  </Txt>
                </View>
                <Button
                  label="Measure"
                  variant="outline"
                  size="sm"
                  icon={Gauge}
                  loading={busy === 'probe'}
                  disabled={!!busy}
                  onPress={() => load('probe')}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { padding: 16, gap: 24, paddingBottom: 48 },
  hero: { gap: 10 },
  gap: { gap: 12 },
  quotaTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  quotaCount: { fontSize: 13 },
  seatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  seatName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRightWidth: 1, borderColor: c.border },
  expand: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  fallbacks: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fallbackIndex: { width: 20 },
  diagnostics: { gap: 16 },
  diagRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  flex: { flex: 1 },
}));
