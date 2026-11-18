import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { ProviderLogo } from '@/components/brand';
import { AppHeader, BackButton, Screen } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { Card, CardHeader, Divider, SectionHeader } from '@/components/ui/layout';
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

function StatTile({ label, value }: { label: string; value: number }) {
  const styles = useStyles();
  const shown = useCountUp(value);
  return (
    <View style={styles.tileWrap}>
      <Card style={styles.tile}>
        <Txt variant="callout" tone="secondary">
          {label}
        </Txt>
        <Txt variant="display" style={styles.tileValue}>
          {shown}
        </Txt>
      </Card>
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
      <Animated.View style={[{ borderRadius: 4, backgroundColor: count ? colors.foreground : colors.muted }, style]} />
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
    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: color }, style]} />
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
    <Screen
      header={
        <AppHeader
          title="Insights"
          leading={<BackButton />}
        />
      }
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing && !!data} onRefresh={load} />}
      >
        <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.hero}>
          <Headline variant="title" muted="Your council," strong="by the numbers." />
        </Animated.View>

        {!data ? (
          <View style={styles.gap}>
            <Skeleton height={200} style={{ borderRadius: radius.lg }} />
            <Skeleton height={160} style={{ borderRadius: radius.lg }} />
          </View>
        ) : data.totals.turns === 0 ? (
          <Card style={styles.gap}>
            <CardHeader
              title="Nothing to measure yet"
              description="Ask the council a few questions and prefer the answers you like — your stats will appear here."
            />
            <Button label="Ask a question" onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <Animated.View entering={FadeInDown.delay(60).springify().damping(20)} style={styles.grid}>
              <StatTile label="Conversations" value={data.totals.threads} />
              <StatTile label="Council turns" value={data.totals.turns} />
              <StatTile label="Preferences cast" value={data.totals.votes} />
              <StatTile label="Consensus built" value={data.totals.synthesized} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(120).springify().damping(20)}>
              <Card style={styles.gap}>
                <CardHeader title="Activity" description="Council turns per day, last 14 days." />
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
                            <Txt variant="caption" tone="secondary">
                              {seat.wins} {seat.wins === 1 ? 'preference' : 'preferences'} · {formatPercent(seat.wins / totalWins)} of votes
                            </Txt>
                          </View>
                        </View>
                        <ShareBar ratio={seat.wins / totalWins} color={colors.seats[seat.seatId] ?? colors.foreground} />
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
    </Screen>
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

const useStyles = makeStyles(() => ({
  scroll: { padding: 16, gap: 24, paddingBottom: 48 },
  hero: { gap: 12 },
  gap: { gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  tileWrap: { flexGrow: 1, flexBasis: 150, padding: 6 },
  tile: { gap: 8, padding: 16 },
  tileValue: { fontSize: 28, lineHeight: 34 },
  chart: { height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  seat: { padding: 16, gap: 12 },
  seatTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seatStats: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
}));
