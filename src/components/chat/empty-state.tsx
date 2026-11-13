import { router } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProviderLogo } from '@/components/brand';
import { pad2 } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { PROMPT_SUGGESTIONS, SEATS } from '@/shared/council';
import { makeStyles, useTheme } from '@/theme';
import { LinkButton } from '../ui/button';
import { Divider, SectionHeader } from '../ui/layout';
import { PressableScale } from '../ui/pressable-scale';
import { Headline, MonoLabel, Txt } from '../ui/text';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const enter = (i: number) => FadeInDown.delay(60 + i * 60).springify().damping(20);

export function EmptyState() {
  const styles = useStyles();
  const { colors } = useTheme();
  const name = useAppStore((s) => s.user?.fullName?.split(' ')[0]);
  const setDraft = useAppStore((s) => s.setDraft);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Animated.View entering={enter(0)} style={styles.hero}>
        <MonoLabel>
          {greeting()}
          {name ? `, ${name}` : ''}
        </MonoLabel>
        <Headline muted="Bring a hard question." strong="The council will argue it out." />
        <Txt tone="secondary" style={styles.lede}>
          Three free models answer in parallel, each from a brief written by its peer. Swipe to compare, prefer the
          strongest, or ask the chair for a consensus.
        </Txt>
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.section}>
        <SectionHeader index="01" title="The council" trailing={<LinkButton label="Status" onPress={() => router.push('/council')} />} />
        <View style={styles.list}>
          {SEATS.map((seat, i) => (
            <View key={seat.id}>
              {i > 0 ? <Divider /> : null}
              <View style={styles.seatRow}>
                <Txt variant="mono" tone="tertiary" style={styles.stamp}>
                  {pad2(i + 1)}
                </Txt>
                <ProviderLogo provider={seat.providerKey} size={30} />
                <View style={styles.flex}>
                  <Txt variant="calloutMedium">{seat.name}</Txt>
                  <Txt variant="caption" tone="tertiary" numberOfLines={1}>
                    {seat.blurb}
                  </Txt>
                </View>
                <View style={[styles.dot, { backgroundColor: colors.seats[seat.id] }]} />
              </View>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={enter(2)} style={styles.section}>
        <SectionHeader index="02" title="Try asking" />
        <View style={styles.list}>
          {PROMPT_SUGGESTIONS.map((prompt, i) => (
            <View key={prompt}>
              {i > 0 ? <Divider /> : null}
              <PressableScale
                scaleTo={0.985}
                onPress={() => {
                  haptic.select();
                  setDraft(prompt);
                }}
                style={styles.suggestion}
                accessibilityRole="button"
                accessibilityHint="Puts this prompt in the message box"
              >
                <Txt variant="callout" style={styles.flex}>
                  {prompt}
                </Txt>
                <ArrowUpRight size={16} color={colors.textTertiary} strokeWidth={1.7} />
              </PressableScale>
            </View>
          ))}
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  scroll: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, gap: 32, width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: { gap: 14 },
  lede: { maxWidth: 520 },
  section: {},
  list: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 14, overflow: 'hidden' },
  seatRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  stamp: { width: 22 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  flex: { flex: 1 },
}));
