import { BookOpen, Code, Lightbulb, Scale, type LucideIcon } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, radius, useTheme } from '@/theme';
import { PressableScale } from '../ui/pressable-scale';
import { Txt } from '../ui/text';
import { Composer } from './composer';

const SUGGESTIONS: { icon: LucideIcon; label: string; prompt: string }[] = [
  { icon: Code, label: 'Design a rate limiter', prompt: 'Design a rate limiter for a public API and explain the trade-offs' },
  { icon: Scale, label: 'Weigh both sides', prompt: 'What are the strongest arguments for and against a four-day work week?' },
  { icon: BookOpen, label: 'Explain B-tree indexes', prompt: 'Explain how a B-tree index speeds up a SQL query, step by step' },
  { icon: Lightbulb, label: 'Review a plan', prompt: 'Review this plan: migrate a monolith to microservices in one quarter' },
];

/**
 * New-chat screen: a centered greeting with suggestion chips. On wide screens
 * the composer sits in the middle too, like a desktop chat app.
 */
export function EmptyState({ centeredComposer }: { centeredComposer: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const name = useAppStore((s) => s.user?.fullName?.split(' ')[0]);
  const setDraft = useAppStore((s) => s.setDraft);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.center}>
        <Animated.View entering={FadeInDown.springify().damping(20)}>
          <Txt variant="display" style={styles.title}>
            {name ? `What can I help with, ${name}?` : 'What can I help with?'}
          </Txt>
          <Txt tone="secondary" style={styles.subtitle}>
            Three AI models answer every question. Compare them, pick the best, or merge them into one.
          </Txt>
        </Animated.View>

        {centeredComposer ? (
          <Animated.View entering={FadeIn.delay(80).duration(260)} style={styles.composer}>
            <Composer autoFocus />
          </Animated.View>
        ) : null}

        <View style={styles.chips}>
          {SUGGESTIONS.map((s, i) => (
            <Animated.View key={s.label} entering={FadeInDown.delay(120 + i * 50).springify().damping(20)}>
              <PressableScale
                scaleTo={0.96}
                onPress={() => {
                  haptic.select();
                  setDraft(s.prompt);
                }}
                style={styles.chip}
                accessibilityRole="button"
                accessibilityHint="Puts this prompt in the message box"
              >
                <s.icon size={16} color={colors.textSecondary} strokeWidth={1.8} />
                <Txt variant="callout" tone="secondary">
                  {s.label}
                </Txt>
              </PressableScale>
            </Animated.View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  center: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 24, alignItems: 'center' },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 8, maxWidth: 460, alignSelf: 'center' },
  composer: { width: '100%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
  },
}));
