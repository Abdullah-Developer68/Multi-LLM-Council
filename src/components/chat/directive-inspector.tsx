import * as Clipboard from 'expo-clipboard';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { useAppStore } from '@/store';
import { makeStyles, springs, useTheme } from '@/theme';
import { Txt } from '../ui/text';

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

/**
 * "Brief from …" disclosure — like a chat app's "Thought for 5s" row. Shows
 * the brief this model received from its peer in the ring.
 */
export function DirectiveInspector({ byName, directive }: { byName: string; directive: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const rotation = useDerivedValue(() => withSpring(open ? 90 : 0, springs.snappy), [open]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
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
        hitSlop={6}
      >
        <Txt variant="callout" tone="secondary">
          Brief from {byName}
        </Txt>
        <Animated.View style={chevron}>
          <ChevronRight size={15} color={colors.textSecondary} strokeWidth={2} />
        </Animated.View>
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={styles.panel}>
          {raw ? (
            <Txt variant="mono" tone="secondary" selectable>
              {directive}
            </Txt>
          ) : (
            <View style={styles.sections}>
              {parsed.role ? <Line label="Role" text={parsed.role} /> : null}
              {parsed.context.length ? <Line label="Context" text={parsed.context.join('\n')} /> : null}
              {parsed.protocol.length ? (
                <Line label="Approach" text={parsed.protocol.map((p, i) => `${i + 1}. ${p}`).join('\n')} />
              ) : null}
              {parsed.constraints.length ? <Line label="Rules" text={parsed.constraints.map((c) => `• ${c}`).join('\n')} /> : null}
            </View>
          )}
          <View style={styles.links}>
            <Pressable onPress={() => setRaw((r) => !r)} hitSlop={6}>
              <Txt variant="caption" tone="accent">
                {raw ? 'Show summary' : 'Show full brief'}
              </Txt>
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={async () => {
                await Clipboard.setStringAsync(directive);
                haptic.success();
                showToast('Brief copied');
              }}
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

function Line({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="label" tone="secondary">
        {label}
      </Txt>
      <Txt variant="callout" tone="secondary">
        {text}
      </Txt>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { marginBottom: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
  panel: { borderLeftWidth: 2, borderColor: c.border, paddingLeft: 14, marginTop: 6, marginBottom: 8, gap: 12 },
  sections: { gap: 10 },
  links: { flexDirection: 'row', gap: 16 },
}));
