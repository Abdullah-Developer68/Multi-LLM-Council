import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';
import { StackedAgentCards } from './stacked-agent-cards';

interface MultiAgentTurnCardProps {
  turnId: string;
}

export function MultiAgentTurnCard({ turnId }: MultiAgentTurnCardProps) {
  const userPrompt = useAppStore((s) => s.turns.find((t) => t.turnId === turnId)?.userPrompt);

  return (
    <View style={styles.turn}>
      {/* User prompt bubble */}
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{userPrompt}</Text>
        </View>
      </View>

      {/* Swipeable stack of AI replies */}
      <StackedAgentCards turnId={turnId} />
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { marginBottom: 28, gap: 14 },
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
});
