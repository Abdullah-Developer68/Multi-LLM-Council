import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Colors, Radius } from '@/constants/colors';
import { useAppStore } from '@/store';

interface ChatInputBarProps {
  /** Styling only: larger input used on the empty-state hero view. */
  hero?: boolean;
}

export function ChatInputBar({ hero = false }: ChatInputBarProps) {
  const activeStage = useAppStore((s) => s.activeStage);
  const submitPrompt = useAppStore((s) => s.submitPrompt);

  const [text, setText] = useState('');

  const isGenerating =
    activeStage !== 'idle' && activeStage !== 'complete' && activeStage !== 'error';
  const canSend = !isGenerating && text.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const prompt = text.trim();
    setText('');
    void submitPrompt(prompt);
  };

  return (
    <View style={[styles.container, hero && styles.containerHero]}>
      <TextInput
        style={[styles.input, hero && styles.inputHero]}
        value={text}
        onChangeText={setText}
        placeholder="Ask anything to the 3 AI models..."
        placeholderTextColor={Colors.textMuted}
        multiline
        textAlignVertical="top"
        editable={!isGenerating}
        underlineColorAndroid="transparent"
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        style={({ pressed }) => [
          styles.sendButton,
          hero && styles.sendButtonHero,
          !canSend && styles.sendButtonDisabled,
          pressed && canSend && styles.sendButtonPressed,
        ]}
        accessibilityLabel="Send"
      >
        <Send size={hero ? 20 : 18} color={canSend ? '#FFFFFF' : Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.xl,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
  },
  containerHero: {
    borderRadius: 22,
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 10,
    borderColor: Colors.borderLight,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 36,
    maxHeight: 130,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    paddingHorizontal: 0,
  },
  inputHero: {
    fontSize: 16,
    minHeight: 84,
    maxHeight: 180,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonHero: { width: 44, height: 44 },
  sendButtonDisabled: { backgroundColor: Colors.surfaceHigh },
  sendButtonPressed: { opacity: 0.85 },
});
