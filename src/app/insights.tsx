import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProviderLogo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Card, Divider, ScreenHeader, SectionHeader } from '@/components/ui/layout';
import { Headline, Label, Txt } from '@/components/ui/text';
import { api } from '@/lib/api';
import { formatLatency, formatPercent, pad2 } from '@/lib/format';
import { useAppStore } from '@/store';
import { getSeat } from '@/shared/council';
import type { InsightsSummary } from '@/shared/types';
import { makeStyles, radius, springs, useTheme } from '@/theme';

/** Counts up from 0 to `target` over ~700ms. */
function useCountUp(target: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / 700);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function StatTile({ label, value, index }: { label: string; value: number; index: number }) {
  const styles = useStyles();
  const shown = useCountUp(value);
  return (
    <View style={[styles.tile, index % 2 === 1 && styles.tileRight, index > 1 && styles.tileBottom]}>
      <Txt variant="display">{shown}</Txt>
      <Txt variant="caption" tone="secondary">
        {label}
      </Txt>
    </View>
  );
}

function ActivityBar({ ratio, index, count }: { ratio: number; index: number; count: number }) {
  const { colors } = useTheme();
  const height = useSharedValue(0);
  useEffect(() => {
    height.set(withDelay(index * 35, withSpring(ratio, springs.gentle)));
  }, [ratio, index, height]);
  const style = useAnimatedStyle(() => ({ height: `${Math.max(height.get() * 100, count ? 6 : 2)}%` }));
  return (
    <View style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
      <Animated.View style={[{ borderRadius: 3, backgroundColor: count ? colors.text : colors.border }, style]} />
    </View>
  );
}

function ShareBar({ ratio, color }: { ratio: number; color: string }) {
  const { colors } = useTheme();
  const width = useSharedValue(0);
  useEffect(() => {
    width.set(withTiming(ratio, { duration: 800 }));
  }, [ratio, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }));
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: color }, style]} />
    </View>
  );
}

export default function InsightsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const [data, setData] = useState<InsightsSummary | null>(null);
  const [refreshing, setRefreshing] = useState(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await api.insights());
    } catch (err) {
      showToast((err as Error).message || 'Could not load insights.', 'danger');
    } finally {
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    let cancelled = false;
    api
      .insights()
      .then((next) => !cancelled && setData(next))
      .catch((err) => showToast((err as Error).message || 'Could not load insights.', 'danger'))
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const max = data ? Math.max(1, ...data.activity.map((a) => a.count)) : 1;
  const seats = data ? [...data.seats].sort((a, b) => b.wins - a.wins || b.answered - a.answered) : [];
  const totalWins = Math.max(1, data?.totals.votes ?? 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Insights" />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing && !!data} onRefresh={load} />}>
        <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.hero}>
          <Headline variant="title" muted="Your council," strong="by the numbers." />
        </Animated.View>

        {!data ? (
          <View style={styles.gap}>
            <Skeleton height={200} style={{ borderRadius: radius.md }} />
            <Skeleton height={160} style={{ borderRadius: radius.md }} />
          </View>
        ) : data.totals.turns === 0 ? (
          <Card style={styles.gap}>
            <Txt variant="bodyMedium">Nothing to measure yet</Txt>
            <Txt tone="secondary">Ask the council a few questions and prefer the answers you like — your stats will appear here.</Txt>
            <Button label="Ask a question" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(60).springify().damping(20)}>
              <SectionHeader title="Totals" />
              <View style={styles.grid}>
                <StatTile index={0} label="Conversations" value={data.totals.threads} />
                <StatTile index={1} label="Council turns" value={data.totals.turns} />
                <StatTile index={2} label="Preferences cast" value={data.totals.votes} />
                <StatTile index={3} label="Consensus built" value={data.totals.synthesized} />
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).springify().damping(20)}>
              <SectionHeader title="Last 14 days" />
              <Card>
                <View style={styles.chart}>
                  {data.activity.map((a, i) => (
                    <ActivityBar key={a.date} ratio={a.count / max} index={i} count={a.count} />
                  ))}
                </View>
                <View style={styles.chartLabels}>
                  <Label>{data.activity[0]?.date.slice(5).replace('-', '.')}</Label>
                  <Label>Today</Label>
                </View>
              </Card>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(180).springify().damping(20)}>
              <SectionHeader title="Seat leaderboard" />
              <Card padded={false}>
                {seats.map((seat, i) => {
                  const def = getSeat(seat.seatId);
                  const total = seat.answered + seat.failed;
                  return (
                    <View key={seat.seatId}>
                      {i > 0 ? <Divider /> : null}
                      <View style={styles.seat}>
                        <View style={styles.seatTop}>
                          <Txt variant="mono" tone="tertiary">
                            {pad2(i + 1)}
                          </Txt>
                          <ProviderLogo provider={def?.providerKey} size={30} />
                          <View style={styles.flex}>
                            <Txt variant="calloutMedium">{def?.name ?? seat.seatId}</Txt>
                            <Txt variant="caption" tone="tertiary">
                              {seat.wins} {seat.wins === 1 ? 'preference' : 'preferences'} · {formatPercent(seat.wins / totalWins)} of votes
                            </Txt>
                          </View>
                        </View>
                        <ShareBar ratio={seat.wins / totalWins} color={colors.seats[seat.seatId] ?? colors.accent} />
                        <View style={styles.seatStats}>
                          <SeatStat label="Answered" value={`${seat.answered}/${total}`} />
                          <SeatStat label="Avg latency" value={formatLatency(seat.avgLatencyMs)} />
                          <SeatStat label="Failover" value={formatPercent(seat.rotatedRate)} />
                          <SeatStat label="Keyless" value={formatPercent(seat.keylessRate)} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SeatStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Label>{label}</Label>
      <Txt variant="calloutMedium">{value}</Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.bg },
  scroll: { padding: 20, gap: 28, paddingBottom: 48, width: '100%', maxWidth: 720, alignSelf: 'center' },
  hero: { gap: 12 },
  gap: { gap: 12 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tile: { width: '50%', padding: 16, gap: 8 },
  tileRight: { borderLeftWidth: 1, borderColor: c.border },
  tileBottom: { borderTopWidth: 1, borderColor: c.border },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  seat: { padding: 16, gap: 12 },
  seatTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seatStats: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
}));
