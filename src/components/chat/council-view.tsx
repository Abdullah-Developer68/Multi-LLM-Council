import { Check, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { getSeat, SEATS } from '@/shared/council';
import { makeStyles, springs, useTheme } from '@/theme';
import { PulseDot } from '../ui/feedback';
import { Txt } from '../ui/text';
import { SeatCard } from './seat-card';
import type { SeatView } from './seat-view';
import { SwipeDeck } from './swipe-deck';

function TabStatus({ view }: { view: SeatView }) {
  const { colors } = useTheme();
  if (view.phase === 'done') return <Check size={12} color={colors.success} strokeWidth={2.4} />;
  if (view.phase === 'error') return <TriangleAlert size={12} color={colors.danger} strokeWidth={2} />;
  return <PulseDot color={colors.seats[view.seatId] ?? colors.accent} size={6} />;
}

/** Tab strip above the deck with a sliding underline; tapping a tab brings that seat forward. */
function SeatTabs({ views, index, onChange }: { views: SeatView[]; index: number; onChange: (i: number) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const tab = width / Math.max(views.length, 1);
  const x = useDerivedValue(() => withSpring(index * tab, springs.snappy), [index, tab]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View style={styles.tabs} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {views.map((view, i) => {
        const seat = getSeat(view.seatId);
        const active = i === index;
        return (
          <Pressable
            key={view.seatId}
            onPress={() => {
              if (!active) haptic.select();
              onChange(i);
            }}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seat?.name}
          >
            <TabStatus view={view} />
            <Txt variant="calloutMedium" tone={active ? 'primary' : 'tertiary'} numberOfLines={1}>
              {seat?.shortName ?? view.seatId}
            </Txt>
          </Pressable>
        );
      })}
      {tab > 0 ? (
        <Animated.View style={[styles.indicator, { width: tab, backgroundColor: colors.text }, indicator]} />
      ) : null}
    </View>
  );
}

/** Seat tabs + swipeable card deck for one turn (live or finished). */
export function CouncilView({
  views,
  preferredSeatId,
  onPrefer,
}: {
  views: SeatView[];
  preferredSeatId?: string | null;
  onPrefer?: (seatId: string) => void;
}) {
  const ordered = [...views].sort(
    (a, b) => SEATS.findIndex((s) => s.id === a.seatId) - SEATS.findIndex((s) => s.id === b.seatId),
  );
  const preferredIndex = ordered.findIndex((v) => v.seatId === preferredSeatId);
  const [index, setIndex] = useState(preferredIndex >= 0 ? preferredIndex : 0);

  return (
    <View style={layout.wrap}>
      <SeatTabs views={ordered} index={index} onChange={setIndex} />
      <SwipeDeck
        index={index}
        onIndexChange={setIndex}
        items={ordered.map((view) => ({
          key: view.seatId,
          highlight: view.seatId === preferredSeatId,
          node: (
            <SeatCard
              view={view}
              preferred={view.seatId === preferredSeatId}
              onPrefer={onPrefer ? () => onPrefer(view.seatId) : undefined}
            />
          ),
        }))}
      />
    </View>
  );
}

const layout = StyleSheet.create({ wrap: { gap: 12 } });

const useStyles = makeStyles((c) => ({
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: c.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 38 },
  indicator: { position: 'absolute', bottom: -1, left: 0, height: 2, borderRadius: 1 },
}));
