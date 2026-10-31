import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';
import { ModelLogo } from './model-logo';

const DOT_COLORS = [Colors.primaryLight, Colors.primaryLight, Colors.primaryLight];

function WaveDot({ index, color }: { index: number; color: string }) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 160),
        Animated.timing(anim, {
          toValue: 1,
          duration: 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 360,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay((DOT_COLORS.length - 1 - index) * 160),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [index, anim]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: color,
          opacity: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 1],
          }),
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -5],
              }),
            },
            {
              scale: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.85, 1.2],
              }),
            },
          ],
        },
      ]}
    />
  );
}

export function TypingIndicator() {
  const pendingPrompt = useAppStore((s) => s.pendingPrompt);
  const activeStage = useAppStore((s) => s.activeStage);
  const stageMessage = useAppStore((s) => s.stageMessage);

  const isStep1Active = activeStage === 'optimizing';
  const isStep2Active = activeStage === 'queryingAgents';
  const isStep3Active = activeStage === 'synthesizing';

  const isStep1Done = isStep2Active || isStep3Active;
  const isStep2Done = isStep3Active;

  return (
    <View style={styles.container}>
      {/* Pending user prompt bubble */}
      {pendingPrompt ? (
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Text style={styles.userText}>{pendingPrompt}</Text>
          </View>
        </View>
      ) : null}

      {/* Deliberation Status Card */}
      <View style={styles.statusCard}>
        {/* Model Logos Row */}
        <View style={styles.headerRow}>
          <View style={styles.logosRow}>
            <View style={styles.logoBadge}>
              <ModelLogo modelId="nemotron" size={16} />
            </View>
            <View style={styles.logoBadge}>
              <ModelLogo modelId="cohere" size={16} />
            </View>
            <View style={styles.logoBadge}>
              <ModelLogo modelId="nemotron" size={16} />
            </View>
          </View>

          <View style={styles.dots}>
            {DOT_COLORS.map((color, i) => (
              <WaveDot key={i} index={i} color={color} />
            ))}
          </View>
        </View>

        {/* Message text */}
        <View style={styles.messageWrap}>
          <Sparkles size={14} color={Colors.primaryLight} />
          <Text style={styles.stageText}>
            {stageMessage || 'Agents are analyzing & refining the prompt...'}
          </Text>
        </View>

        {/* 3-Step Progress Track */}
        <View style={styles.stepperContainer}>
          {/* Step 1 */}
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, isStep1Done ? styles.stepCircleDone : isStep1Active ? styles.stepCircleActive : styles.stepCirclePending]}>
              {isStep1Done ? <Check size={10} color="#FFFFFF" /> : <Text style={styles.stepNum}>1</Text>}
            </View>
            <Text style={[styles.stepLabel, (isStep1Active || isStep1Done) && styles.stepLabelActive]}>
              Refine
            </Text>
          </View>

          <View style={[styles.stepLine, isStep1Done && styles.stepLineDone]} />

          {/* Step 2 */}
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, isStep2Done ? styles.stepCircleDone : isStep2Active ? styles.stepCircleActive : styles.stepCirclePending]}>
              {isStep2Done ? <Check size={10} color="#FFFFFF" /> : <Text style={styles.stepNum}>2</Text>}
            </View>
            <Text style={[styles.stepLabel, (isStep2Active || isStep2Done) && styles.stepLabelActive]}>
              Ring Handoff
            </Text>
          </View>

          <View style={[styles.stepLine, isStep2Done && styles.stepLineDone]} />

          {/* Step 3 */}
          <View style={styles.stepItem}>
            <View style={[styles.stepCircle, isStep3Active ? styles.stepCircleActive : styles.stepCirclePending]}>
              <Text style={styles.stepNum}>3</Text>
            </View>
            <Text style={[styles.stepLabel, isStep3Active && styles.stepLabelActive]}>
              Consensus
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, marginBottom: 20 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '85%',
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    borderBottomRightRadius: Radius.xs,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: '#FFFFFF', fontSize: 15, lineHeight: 21 },
  statusCard: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: 14,
    gap: 12,
    maxWidth: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
    paddingHorizontal: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  messageWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  stageText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  stepItem: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCirclePending: {
    backgroundColor: Colors.surfaceElevated,
  },
  stepCircleActive: {
    backgroundColor: Colors.primary,
  },
  stepCircleDone: {
    backgroundColor: Colors.primaryLight,
  },
  stepNum: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  stepLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  stepLabelActive: {
    color: Colors.primaryLight,
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: 8,
    marginBottom: 16,
  },
  stepLineDone: {
    backgroundColor: Colors.success,
  },
});
