import { BookOpen, ChevronRight, Code, Lightbulb, Scale, type LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { LogoTile } from '@/components/brand';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, radius, useTheme } from '@/theme';
import { IconTile } from '../ui/layout';
import { Txt } from '../ui/text';

const SUGGESTIONS: { icon: LucideIcon; label: string; description: string; prompt: string }[] = [
  {
    icon: Code,
    label: 'Design a rate limiter',
    description: 'Three takes on the trade-offs',
    prompt: 'Design a rate limiter for a public API and explain the trade-offs',
  },
  {
    icon: Scale,
    label: 'Weigh both sides',
    description: 'The strongest case for each',
    prompt: 'What are the strongest arguments for and against a four-day work week?',
  },
  {
    icon: BookOpen,
    label: 'Explain B-tree indexes',
    description: 'Step by step, merged into one',
    prompt: 'Explain how a B-tree index speeds up a SQL query, step by step',
  },
  {
    icon: Lightbulb,
    label: 'Review a plan',
    description: 'Let the council poke holes in it',
    prompt: 'Review this plan: migrate a monolith to microservices in one quarter',
  },
];

/** New-chat screen: logo tile, greeting, then full-width suggestion rows. */
export function EmptyState() {
  const styles = useStyles();
  const { colors } = useTheme();
  const name = useAppStore((s) => s.user?.fullName?.split(' ')[0]);
  const setDraft = useAppStore((s) => s.setDraft);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.springify().damping(20)} style={styles.hero}>
        <LogoTile size={44} />
        <Txt variant="display" style={styles.title}>
          {name ? `What should the council weigh in on, ${name}?` : 'What should the council weigh in on?'}
        </Txt>
      </Animated.View>

      <View style={styles.list}>
        {SUGGESTIONS.map((s, i) => (
          <Animated.View key={s.label} entering={FadeInDown.delay(100 + i * 50).springify().damping(20)}>
            <Pressable
              onPress={() => {
                haptic.select();
                setDraft(s.prompt);
              }}
              style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.muted }]}
              accessibilityRole="button"
              accessibilityHint="Puts this prompt in the message box"
            >
              <IconTile size={32}>
                <s.icon size={16} color={colors.foreground} strokeWidth={1.75} />
              </IconTile>
              <View style={styles.flex}>
                <Txt variant="bodyMedium" style={styles.cardTitle}>
                  {s.label}
                </Txt>
                <Txt variant="caption" tone="secondary">
                  {s.description}
                </Txt>
              </View>
              <ChevronRight size={16} color={colors.mutedForeground} strokeWidth={1.75} />
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24, gap: 28 },
  hero: { alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  title: { textAlign: 'center' },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    backgroundColor: c.card,
  },
  cardTitle: { fontSize: 15 },
  flex: { flex: 1 },
}));
