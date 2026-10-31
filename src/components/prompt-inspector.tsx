import * as Clipboard from 'expo-clipboard';
import {
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Layers,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';
import { ModelLogo } from './model-logo';

interface PromptInspectorProps {
  turnId: string;
  agentId: string;
}

interface ParsedPromptSections {
  objective?: string;
  role?: string;
  userTask?: string;
  protocol?: string[];
  constraints?: string[];
  rawText: string;
}

function parsePromptDirectives(rawPrompt: string): ParsedPromptSections {
  const result: ParsedPromptSections = { rawText: rawPrompt };

  // 1. Objective
  const objMatch = rawPrompt.match(/<objective>([\s\S]*?)<\/objective>/i);
  if (objMatch) {
    result.objective = objMatch[1].trim();
  }

  // 2. Role
  const roleMatch = rawPrompt.match(/<role>([\s\S]*?)<\/role>/i);
  if (roleMatch) {
    result.role = roleMatch[1].replace(/You are acting as a\s*/i, '').replace(/\.$/, '').trim();
  }

  // 3. User Task
  const taskMatch = rawPrompt.match(/<user_task>([\s\S]*?)<\/user_task>/i) ||
                    rawPrompt.match(/<task>([\s\S]*?)<\/task>/i);
  if (taskMatch) {
    result.userTask = taskMatch[1].trim();
  }

  // 4. Execution Protocol
  const protocolMatch = rawPrompt.match(/<execution_protocol>([\s\S]*?)<\/execution_protocol>/i) ||
                        rawPrompt.match(/### \[REASONING GUIDELINES[^\]]*\]([\s\S]*?)(?=###|<constraints>|$)/i);
  if (protocolMatch) {
    const rawLines = protocolMatch[1].trim().split('\n');
    const steps: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('###')) continue;
      // Strip leading numbers or bullets: 1. or - or *
      const cleanStep = trimmed.replace(/^[0-9]+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim();
      if (cleanStep) steps.push(cleanStep);
    }
    if (steps.length > 0) result.protocol = steps;
  }

  // 5. Constraints
  const constrMatch = rawPrompt.match(/<constraints>([\s\S]*?)<\/constraints>/i) ||
                      rawPrompt.match(/### \[GUARDRAILS[^\]]*\]([\s\S]*?)(?=###|$)/i);
  if (constrMatch) {
    const rawLines = constrMatch[1].trim().split('\n');
    const items: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('###') || trimmed.startsWith('-')) {
        const clean = trimmed.replace(/^[-*]\s*/, '').trim();
        if (clean) items.push(clean);
      }
    }
    if (items.length > 0) result.constraints = items;
  }

  return result;
}

export function PromptInspector({ turnId, agentId }: PromptInspectorProps) {
  const receivedPrompt = useAppStore(
    (s) =>
      s.turns.find((t) => t.turnId === turnId)?.agentResponses.find((r) => r.agentId === agentId)
        ?.receivedPrompt,
  );
  const optimizerId = useAppStore(
    (s) =>
      s.turns.find((t) => t.turnId === turnId)?.agentResponses.find((r) => r.agentId === agentId)
        ?.optimizedByAgentId,
  );
  const optimizerName =
    useAppStore(
      (s) =>
        s.turns.find((t) => t.turnId === turnId)?.agentResponses.find((r) => r.agentId === agentId)
          ?.optimizedByAgentName,
    ) ?? 'Peer Model';
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'structured' | 'raw'>('structured');
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    if (!receivedPrompt) return null;
    return parsePromptDirectives(receivedPrompt);
  }, [receivedPrompt]);

  if (!receivedPrompt || !receivedPrompt.trim()) {
    return null;
  }

  const handleCopy = async () => {
    await Clipboard.setStringAsync(receivedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.container}>
      {/* Accordion Header Toggle */}
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        style={({ pressed }) => [
          styles.toggleButton,
          isOpen && styles.toggleButtonActive,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.toggleHeader}>
          <View style={styles.sparkleWrap}>
            <Sparkles size={14} color={Colors.primaryLight} />
          </View>
          <View style={styles.toggleMeta}>
            <Text style={styles.toggleTitle} numberOfLines={1}>
              Prompt Engineered by {optimizerName}
            </Text>
            <Text style={styles.toggleSubtitle}>
              {isOpen ? 'Tap to collapse structured directive' : 'Tap to inspect optimized peer prompt'}
            </Text>
          </View>
          <View style={styles.toggleIconWrap}>
            {isOpen ? (
              <ChevronUp size={16} color={Colors.primaryLight} />
            ) : (
              <ChevronDown size={16} color={Colors.textMuted} />
            )}
          </View>
        </View>
      </Pressable>

      {/* Expanded Structured Inspector */}
      {isOpen && (
        <View style={styles.expandedContent}>
          {/* Top Bar with Mode Switcher & Copy */}
          <View style={styles.contentToolbar}>
            <View style={styles.modeTabs}>
              <Pressable
                onPress={() => setViewMode('structured')}
                style={[styles.modeTab, viewMode === 'structured' && styles.modeTabActive]}
              >
                <Layers size={13} color={viewMode === 'structured' ? Colors.textPrimary : Colors.textMuted} />
                <Text style={[styles.modeTabText, viewMode === 'structured' && styles.modeTabTextActive]}>
                  Structured
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('raw')}
                style={[styles.modeTab, viewMode === 'raw' && styles.modeTabActive]}
              >
                <Code2 size={13} color={viewMode === 'raw' ? Colors.textPrimary : Colors.textMuted} />
                <Text style={[styles.modeTabText, viewMode === 'raw' && styles.modeTabTextActive]}>
                  Raw
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={handleCopy}
              style={({ pressed }) => [
                styles.copyButton,
                copied && styles.copyButtonCopied,
                pressed && styles.pressed,
              ]}
              hitSlop={8}
              accessibilityLabel="Copy prompt"
            >
              {copied ? (
                <Check size={14} color={Colors.success} />
              ) : (
                <Copy size={14} color={Colors.textSecondary} />
              )}
            </Pressable>
          </View>

          {/* Structured View */}
          {viewMode === 'structured' && parsed ? (
            <View style={styles.sectionsList}>
              {/* 1. Header Badge: Optimizer Identity */}
              <View style={styles.badgeBanner}>
                <ModelLogo modelId={optimizerId} size={18} />
                <Text style={styles.bannerText}>
                  Refined and validated by <Text style={styles.bannerStrong}>{optimizerName}</Text>
                </Text>
              </View>

              {/* 2. Assigned Persona & Role */}
              {parsed.role ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Award size={14} color={Colors.primaryLight} />
                    <Text style={styles.sectionHeading}>Assigned Cognitive Persona</Text>
                  </View>
                  <View style={styles.roleBox}>
                    <Text style={styles.roleText}>{parsed.role}</Text>
                  </View>
                </View>
              ) : null}

              {/* 3. Execution Objective */}
              {parsed.objective ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Target size={14} color={Colors.primaryLight} />
                    <Text style={styles.sectionHeading}>Execution Objective</Text>
                  </View>
                  <View style={styles.objectiveBox}>
                    <Text style={styles.objectiveText}>{parsed.objective}</Text>
                  </View>
                </View>
              ) : null}

              {/* 4. Underlying User Query */}
              {parsed.userTask ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <MessageSquareQuote size={14} color={Colors.primaryLight} />
                    <Text style={styles.sectionHeading}>Target User Task</Text>
                  </View>
                  <View style={styles.userTaskBox}>
                    <Text style={styles.userTaskText}>{parsed.userTask}</Text>
                  </View>
                </View>
              ) : null}

              {/* 5. Reasoning Protocol Steps */}
              {parsed.protocol && parsed.protocol.length > 0 ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <Layers size={14} color={Colors.primaryLight} />
                    <Text style={styles.sectionHeading}>Execution Protocol & Reasoning Directives</Text>
                  </View>
                  <View style={styles.protocolList}>
                    {parsed.protocol.map((step, idx) => (
                      <View key={idx} style={styles.protocolItem}>
                        <View style={styles.protocolIndex}>
                          <Text style={styles.protocolIndexText}>{idx + 1}</Text>
                        </View>
                        <Text style={styles.protocolText}>{step}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* 6. Enforced Guardrails & Constraints */}
              {parsed.constraints && parsed.constraints.length > 0 ? (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <ShieldCheck size={14} color={Colors.primaryLight} />
                    <Text style={styles.sectionHeading}>Guardrails & Negative Constraints</Text>
                  </View>
                  <View style={styles.constraintsList}>
                    {parsed.constraints.map((c, idx) => (
                      <View key={idx} style={styles.constraintItem}>
                        <View style={styles.constraintDot} />
                        <Text style={styles.constraintText}>{c}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            /* Raw Monospace Text View */
            <View style={styles.rawContainer}>
              <Text style={styles.rawCodeText} selectable>
                {receivedPrompt}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  toggleButton: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
  },
  toggleButtonActive: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.card,
  },
  pressed: {
    opacity: 0.8,
  },
  toggleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleMeta: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  toggleIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandedContent: {
    backgroundColor: Colors.background,
    borderColor: Colors.borderLight,
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    padding: 12,
    gap: 12,
  },
  contentToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modeTabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceHigh,
    padding: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.xs,
  },
  modeTabActive: {
    backgroundColor: Colors.card,
  },
  modeTabText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  modeTabTextActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  copyButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonCopied: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  sectionsList: {
    gap: 10,
  },
  badgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bannerStrong: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  bannerText: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    gap: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeading: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  roleBox: {
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  roleText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  objectiveBox: {
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  objectiveText: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
  },
  userTaskBox: {
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.xs,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  userTaskText: {
    color: Colors.textPrimary,
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  protocolList: {
    gap: 6,
  },
  protocolItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  protocolIndex: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  protocolIndexText: {
    color: Colors.accentForeground,
    fontSize: 10,
    fontWeight: '700',
  },
  protocolText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },
  constraintsList: {
    gap: 6,
  },
  constraintItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  constraintDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
    marginTop: 6,
  },
  constraintText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  rawContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    maxHeight: 280,
  },
  rawCodeText: {
    color: Colors.accentForeground,
    fontFamily: 'monospace',
    fontSize: 11.5,
    lineHeight: 17,
  },
});
