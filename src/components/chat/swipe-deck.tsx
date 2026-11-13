import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { radius, springs, useTheme } from '@/theme';

const PEEK = 9;
const SCALE_STEP = 0.045;
const FALLBACK_HEIGHT = 240;

export interface DeckItem {
  key: string;
  node: ReactNode;
  highlight?: boolean;
}

function mod(a: number, n: number) {
  'worklet';
  return ((a % n) + n) % n;
}

/**
 * A physical stack of cards. The top card follows the finger and flies off
 * when released past the threshold; the cards behind rise to meet it. All
 * position maths runs on the UI thread from a single `top` index, so the
 * hand-off between cards happens in one frame without flicker.
 */
export function SwipeDeck({
  items,
  index,
  onIndexChange,
}: {
  items: DeckItem[];
  index: number;
  onIndexChange: (index: number) => void;
}) {
  const n = items.length;
  const top = useSharedValue(index);
  const drag = useSharedValue(0);
  const width = useSharedValue(0);
  const pop = useSharedValue(1);
  const height = useSharedValue(0);
  const [heights, setHeights] = useState<Record<number, number>>({});

  // Tab taps change `index` from outside: jump with a small pop.
  useEffect(() => {
    if (top.get() !== index) {
      top.set(index);
      pop.set(0);
      pop.set(withSpring(1, springs.gentle));
    }
  }, [index, top, pop]);

  const topHeight = heights[index] ?? 0;
  useEffect(() => {
    if (!topHeight) return;
    height.set(height.get() === 0 ? topHeight : withTiming(topHeight, { duration: 220 }));
  }, [topHeight, height]);

  const commit = (next: number) => {
    haptic.select();
    onIndexChange(next);
  };

  const pan = usePanGesture({
    enabled: n > 1,
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onUpdate: (e) => {
      'worklet';
      drag.set(e.translationX);
    },
    onDeactivate: (e) => {
      'worklet';
      const w = width.get() || 360;
      const flung = Math.abs(e.translationX) > w * 0.28 || Math.abs(e.velocityX) > 700;
      if (!flung) {
        drag.set(withSpring(0, springs.snappy));
        return;
      }
      const dir = e.translationX < 0 ? -1 : 1;
      drag.set(
        withTiming(dir * w * 1.25, { duration: 190 }, (finished) => {
          if (!finished) return;
          const next = mod(top.get() + (dir < 0 ? 1 : -1), n);
          top.set(next);
          drag.set(0);
          scheduleOnRN(commit, next);
        }),
      );
    },
  });

  const containerStyle = useAnimatedStyle(() => ({
    height: (height.get() || FALLBACK_HEIGHT) + PEEK * (n - 1),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={containerStyle} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
        {items.map((item, i) => (
          <DeckCard
            key={item.key}
            i={i}
            n={n}
            top={top}
            drag={drag}
            width={width}
            pop={pop}
            height={height}
            highlight={item.highlight}
            onMeasure={(h) => setHeights((prev) => (prev[i] === h ? prev : { ...prev, [i]: h }))}
          >
            {item.node}
          </DeckCard>
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

function DeckCard({
  i,
  n,
  top,
  drag,
  width,
  pop,
  height,
  highlight,
  onMeasure,
  children,
}: {
  i: number;
  n: number;
  top: SharedValue<number>;
  drag: SharedValue<number>;
  width: SharedValue<number>;
  pop: SharedValue<number>;
  height: SharedValue<number>;
  highlight?: boolean;
  onMeasure: (h: number) => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();

  // Cards behind the top one show only their edge; their content fades in as they rise.
  const contentStyle = useAnimatedStyle(() => {
    const k = mod(i - top.get(), n);
    if (k === 0) return { opacity: 1 };
    const progress = Math.min(Math.abs(drag.get()) / (width.get() || 360), 1);
    return { opacity: k === 1 ? progress : 0 };
  });

  const style = useAnimatedStyle(() => {
    const k = mod(i - top.get(), n);
    const w = width.get() || 360;
    const h = height.get() || FALLBACK_HEIGHT;
    if (k === 0) {
      const tx = drag.get();
      return {
        height: h,
        zIndex: n,
        opacity: 1,
        transform: [
          { translateX: tx },
          { translateY: interpolate(pop.get(), [0, 1], [12, 0]) },
          { rotate: `${(tx / w) * 6}deg` },
          { scale: interpolate(pop.get(), [0, 1], [0.97, 1]) },
        ],
      };
    }
    const progress = Math.min(Math.abs(drag.get()) / w, 1);
    const pos = Math.max(k - progress, 0);
    return {
      height: h,
      zIndex: n - k,
      opacity: interpolate(pos, [0, n - 1], [1, 0.7]),
      transform: [{ translateX: 0 }, { translateY: pos * PEEK }, { rotate: '0deg' }, { scale: 1 - pos * SCALE_STEP }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: highlight ? colors.text : colors.border },
        style,
      ]}
    >
      <Animated.View style={contentStyle} onLayout={(e) => onMeasure(Math.ceil(e.nativeEvent.layout.height) + 2)}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
