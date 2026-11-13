import * as Clipboard from 'expo-clipboard';
import { ChevronDown, Copy, CornerDownRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, radius, springs, useTheme } from '@/theme';
import { Segmented } from '../ui/controls';
import { MonoLabel, Txt } from '../ui/text';

interface ParsedDirective {
  role?: string;
  protocol: string[];
  constraints: string[];
  context: string[];
}

function between(text: string, tag: string): string | undefined {
  return text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim();
}

function parse(directive: string): ParsedDirective {
  const lines = (block?: string) =>
    (block ?? '')
      .split('\n')
      .map((l) => l.replace(/^\s*(?:\d+\.|[-*•])\s*/, '').trim())
      .filter(Boolean);
  return {
    role: between(directive, 'role'),
    protocol: lines(between(directive, 'protocol') ?? between(directive, 'execution_protocol')),
    constraints: lines(between(directive, 'constraints')),
    context: lines(between(directive, 'conversation_so_far')).filter((l) => l.startsWith('[')),
  };
}

/** Expandable view of the brief a seat received from its ring peer. */
export function DirectiveInspector({ byName, directive }: { byName: string; directive: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'structured' | 'raw'>('structured');
  const rotation = useDerivedValue(() => withSpring(open ? 180 : 0, springs.snappy), [open]);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const parsed = parse(directive);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          haptic.select();
          setOpen((o) => !o);
        }}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <CornerDownRight size={14} color={colors.textTertiary} strokeWidth={1.7} />
        <Txt variant="caption" tone="secondary" style={styles.toggleText} numberOfLines={1}>
          Brief written by <Txt variant="caption">{byName}</Txt>
        </Txt>
        <Animated.View style={chevronStyle}>
          <ChevronDown size={15} color={colors.textTertiary} strokeWidth={1.7} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.panel}>
          <View style={styles.toolbar}>
            <View style={styles.segmented}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'structured', label: 'Structured' },
                  { value: 'raw', label: 'Raw' },
                ]}
              />
            </View>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(directive);
                haptic.success();
                showToast('Brief copied');
              }}
              hitSlop={8}
              accessibilityLabel="Copy brief"
              style={styles.copy}
            >
              <Copy size={15} color={colors.textSecondary} strokeWidth={1.7} />
            </Pressable>
          </View>

          {mode === 'raw' ? (
            <Txt variant="mono" tone="secondary" selectable>
              {directive}
            </Txt>
          ) : (
            <View style={styles.sections}>
              {parsed.role ? (
                <Section label="Role">
                  <Txt variant="calloutMedium">{parsed.role}</Txt>
                </Section>
              ) : null}
              {parsed.context.length ? (
                <Section label="Context carried over">
                  {parsed.context.map((line, i) => (
                    <Txt key={i} variant="caption" tone="secondary" numberOfLines={3}>
                      {line}
                    </Txt>
                  ))}
                </Section>
              ) : null}
              {parsed.protocol.length ? (
                <Section label="Protocol">
                  {parsed.protocol.map((step, i) => (
                    <View key={i} style={styles.step}>
                      <Txt variant="mono" tone="tertiary" style={styles.stepIndex}>
                        {String(i + 1).padStart(2, '0')}
                      </Txt>
                      <Txt variant="callout" style={styles.flex}>
                        {step}
                      </Txt>
                    </View>
                  ))}
                </Section>
              ) : null}
              {parsed.constraints.length ? (
                <Section label="Guardrails">
                  {parsed.constraints.map((c, i) => (
                    <View key={i} style={styles.step}>
                      <View style={[styles.dot, { backgroundColor: colors.textTertiary }]} />
                      <Txt variant="callout" tone="secondary" style={styles.flex}>
                        {c}
                      </Txt>
                    </View>
                  ))}
                </Section>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.section}>
      <MonoLabel>{label}</MonoLabel>
      <View style={sectionStyles.body}>{children}</View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  section: { gap: 8 },
  body: { gap: 6 },
});

const useStyles = makeStyles((c) => ({
  wrap: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border, marginHorizontal: -16 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { flex: 1 },
  panel: { paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segmented: { width: 220 },
  copy: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: c.border,
  },
  sections: { gap: 16 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepIndex: { width: 20, marginTop: 1 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 8, marginHorizontal: 8 },
  flex: { flex: 1 },
}));
