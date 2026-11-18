import * as Clipboard from 'expo-clipboard';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { shortModelName } from '@/shared/council';
import type { TurnRefinement } from '@/shared/types';
import { useAppStore } from '@/store';
import type { LiveTurn } from '@/store/types';
import { makeStyles, radius, springs, useTheme } from '@/theme';
import { Txt } from '../ui/text';
import { ThinkingIndicator } from './thinking-indicator';

/**
 * Collapsible disclosure showing the Prompt Refiner's rewritten prompt
 * (or a muted fallback notice when the refiner was unavailable).
 */
export function RefinedPrompt({ refinement }: { refinement: TurnRefinement }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const rotation = useDerivedValue(() => withSpring(open ? 90 : 0, springs.snappy), [open]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  if (!refinement.refined) {
    return (
      <View style={styles.fallbackRow}>
        <Sparkles size={16} color={colors.faint} strokeWidth={1.75} />
        <Txt variant="callout" tone="tertiary" style={styles.flexShrink}>
          Sent your original prompt — the refiner was unavailable
        </Txt>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          haptic.select();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
      >
        <Sparkles size={16} color={colors.mutedForeground} strokeWidth={1.75} />
        <Txt variant="callout" tone="secondary">
          Prompt refined
        </Txt>
        <Txt variant="caption" tone="tertiary" numberOfLines={1} style={styles.flexShrink}>
          {shortModelName(refinement.model)}
        </Txt>
        <Animated.View style={chevron}>
          <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.75} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.card}>
          <Txt variant="callout" tone="secondary" selectable>
            {refinement.prompt}
          </Txt>
          <View style={styles.actions}>
            <Pressable
              hitSlop={6}
              onPress={async () => {
                await Clipboard.setStringAsync(refinement.prompt);
                haptic.success();
                showToast('Refined prompt copied');
              }}
              style={({ pressed }) => [styles.copyAction, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Copy refined prompt"
            >
              <Txt variant="caption" tone="accent">
                Copy
              </Txt>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Live refinement row while a turn is streaming. */
export function LiveRefinedPrompt({ refinement }: { refinement: LiveTurn['refinement'] }) {
  if (refinement.status === 'refining') {
    return <ThinkingIndicator label="Refining your prompt…" />;
  }
  return (
    <RefinedPrompt
      refinement={{
        prompt: refinement.prompt ?? '',
        model: refinement.model,
        latencyMs: 0,
        refined: refinement.refined ?? true,
      }}
    />
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {},
  fallbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginLeft: -6,
    borderRadius: radius.md,
  },
  pressed: { backgroundColor: c.muted },
  card: {
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    backgroundColor: c.card,
    gap: 10,
  },
  actions: { flexDirection: 'row', alignItems: 'center' },
  copyAction: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginLeft: -6,
    borderRadius: radius.sm,
  },
  flexShrink: { flexShrink: 1 },
}));
